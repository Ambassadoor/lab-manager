"""Communication with the Brother PT-P950NW label printer, over the network
or USB (PRINTER_CONNECTION).

Kept separate from main.py so the FastAPI routes stay thin — this module
owns the P-touch Template command protocol, the raw socket / USB device
I/O for printing, and the status query (SNMP over the network, a direct
^SR request over USB — see get_status()'s docstring for why).

Printing requires a label template to already be transferred onto the
printer's own memory via P-touch Editor's Transfer Manager (a one-time,
manual, Windows-only step) — this module can only select a template by
its assigned number (1-99) and fill in its named objects, not create or
upload one.
"""

import asyncio
import glob
import os
import select
import socket
import time
from pathlib import Path

from pysnmp.hlapi.v1arch.asyncio import (
    CommunityData,
    ObjectIdentity,
    ObjectType,
    SnmpDispatcher,
    UdpTransportTarget,
    get_cmd,
)

# "network" (raw socket to PRINTER_IP:PRINTER_PORT) or "usb" (the printer's
# USB printer-class device, e.g. /dev/usb/lp0 on Linux). USB exists for
# networks that block the bridge's machine from reaching the printer.
PRINTER_CONNECTION = os.getenv("PRINTER_CONNECTION", "network").strip().lower()
PRINTER_IP = os.getenv("PRINTER_IP")
PRINTER_PORT = int(os.getenv("PRINTER_PORT", "9100"))
# Optional explicit device path; when unset, the first USB printer device
# whose vendor is Brother is used, so it survives lp0 -> lp1 renumbering.
PRINTER_USB_DEVICE = os.getenv("PRINTER_USB_DEVICE")
BROTHER_USB_VENDOR_ID = "04f9"
TIMEOUT_SECONDS = 5

STATUS_RESPONSE_SIZE = 32
DELIMITER = b"\x09"  # default P-touch Template field delimiter (tab)

# The 32-byte status structure is also retrievable over SNMP, as a single
# vendor MIB OID — the only way that structure is actually reachable over
# the network for this printer (see get_status() docstring). Confirmed
# supported on the PT-P950NW specifically by Brother.
SNMP_COMMUNITY = os.getenv("PRINTER_SNMP_COMMUNITY", "public")
_STATUS_OID = "1.3.6.1.4.1.2435.3.3.9.1.6.1.0"

# Created lazily, on first use inside get_status() rather than here at
# module level — SnmpDispatcher() needs a running asyncio event loop, and
# module import happens before uvicorn's loop exists. Cached afterward
# since it's expensive to create and safe to reuse for the app's lifetime.
_snmp_dispatcher: SnmpDispatcher | None = None


def _get_snmp_dispatcher() -> SnmpDispatcher:
    global _snmp_dispatcher
    if _snmp_dispatcher is None:
        _snmp_dispatcher = SnmpDispatcher()
    return _snmp_dispatcher


# ESC i a, mode select — sent before every command since it's the one
# command documented to work regardless of the printer's *current* mode
# (ESC/P, raster, or P-touch Template). Everything else in this module
# only means anything once the printer is confirmed in P-touch Template
# mode; without this, a command sent while the printer is in a different
# mode is silently ignored rather than erroring, which is indistinguishable
# from a network problem from the caller's side.
_SELECT_PTOUCH_TEMPLATE_MODE = b"\x1bia\x03"

# Byte offsets within the 32-byte status response. Same structure for
# both `^SR` (P-touch Template mode) and `ESC i S` (raster mode).
_OFFSET_BATTERY = 6
_OFFSET_ERROR_1 = 8
_OFFSET_ERROR_2 = 9
_OFFSET_MEDIA_WIDTH = 10
_OFFSET_MEDIA_TYPE = 11
_OFFSET_MEDIA_LENGTH = 17

_MEDIA_TYPES = {
    0x00: "no media",
    0x01: "laminated tape",
    0x03: "non-laminated tape",
    0x04: "fabric tape",
    0x11: "heat-shrink tube",
    0x13: "fle tape",
    0x14: "flexible ID tape",
}

_ERROR_1_FLAGS = {
    0x01: "no media",
    0x02: "end of media",
    0x04: "cutter jam",
    0x08: "weak batteries",
    0x40: "high-voltage adapter",
}

_ERROR_2_FLAGS = {
    0x01: "wrong media",
    0x02: "expansion buffer full",
    0x04: "communication error",
    0x08: "communication buffer full",
    0x10: "cover open",
    0x20: "overheating",
    0x40: "black marking not detected",
    0x80: "system error",
}


def _decode_flags(byte: int, flags: dict[int, str]) -> list[str]:
    return [name for mask, name in flags.items() if byte & mask]


def _send(data: bytes, response_size: int = 0) -> bytes:
    """Send a command over the configured connection, optionally reading a
    fixed-size response. One connection per operation, same pattern as
    balance.py's open-per-call approach for the serial port."""
    if _connection() == "usb":
        return _send_usb(data, response_size)
    return _send_network(data, response_size)


def _connection() -> str:
    if PRINTER_CONNECTION not in ("network", "usb"):
        raise OSError(f"PRINTER_CONNECTION must be 'network' or 'usb', not {PRINTER_CONNECTION!r}")
    return PRINTER_CONNECTION


def _find_usb_device() -> str:
    if PRINTER_USB_DEVICE:
        return PRINTER_USB_DEVICE
    # /sys/class/usbmisc/lpN/device is the USB interface; its parent holds
    # the device-level idVendor.
    for sys_dir in sorted(glob.glob("/sys/class/usbmisc/lp*")):
        vendor_file = Path(sys_dir, "device").resolve().parent / "idVendor"
        try:
            if vendor_file.read_text().strip() == BROTHER_USB_VENDOR_ID:
                return f"/dev/usb/{Path(sys_dir).name}"
        except OSError:
            continue
    raise OSError("No Brother printer found on USB — is it plugged in and switched on?")


def _send_usb(data: bytes, response_size: int) -> bytes:
    device = _find_usb_device()
    try:
        fd = os.open(device, os.O_RDWR)
    except OSError as e:
        raise OSError(f"Could not open printer USB device {device}: {e}") from e

    try:
        view = memoryview(data)
        while view:
            view = view[os.write(fd, view) :]
        if not response_size:
            return b""

        # Unlike the network raw port, USB is bidirectional, so status
        # requests get an answer — but reads block, hence select().
        response = b""
        deadline = time.monotonic() + TIMEOUT_SECONDS
        while len(response) < response_size:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([fd], [], [], remaining)[0]:
                raise OSError(
                    f"Printer on {device} got no response within {TIMEOUT_SECONDS}s "
                    f"(received {len(response)} of {response_size} bytes)"
                )
            chunk = os.read(fd, response_size - len(response))
            if chunk:
                response += chunk
            else:
                time.sleep(0.05)  # usblp can report readable with nothing buffered yet
        return response
    finally:
        os.close(fd)


def _send_network(data: bytes, response_size: int = 0) -> bytes:
    try:
        sock = socket.create_connection((PRINTER_IP, PRINTER_PORT), timeout=TIMEOUT_SECONDS)
    except OSError as e:
        raise OSError(f"Could not connect to printer at {PRINTER_IP}:{PRINTER_PORT}: {e}") from e

    with sock:
        sock.sendall(data)
        if not response_size:
            return b""

        response = b""
        while len(response) < response_size:
            try:
                chunk = sock.recv(response_size - len(response))
            except TimeoutError as e:
                raise OSError(
                    f"Connected to printer, but got no response within {TIMEOUT_SECONDS}s "
                    f"(received {len(response)} of {response_size} bytes)"
                ) from e
            if not chunk:
                break
            response += chunk
        return response


async def get_status() -> dict:
    """Query the printer's current status: media, battery, errors.

    Over the network this goes over SNMP, not the raw socket printing uses.
    Brother's own docs show the network raw connection only supports
    one-directional print data (confirmed by comparing the raster doc's USB
    vs. network flow charts, and by testing — ^SR/ESC i S get no response at
    all over that connection). SNMP is the mechanism Brother actually
    documents for reaching this same status structure over the network on
    this model. Over USB, which is bidirectional, ^SR is asked directly.
    """
    if _connection() == "usb":
        response = await asyncio.to_thread(
            _send, _SELECT_PTOUCH_TEMPLATE_MODE + b"^SR", STATUS_RESPONSE_SIZE
        )
    else:
        response = await _get_status_snmp()

    if len(response) < STATUS_RESPONSE_SIZE:
        raise OSError(
            f"Incomplete status response from printer ({len(response)} of "
            f"{STATUS_RESPONSE_SIZE} bytes)"
        )

    return {
        "battery_level": response[_OFFSET_BATTERY],
        "media_width_mm": response[_OFFSET_MEDIA_WIDTH],
        "media_length_mm": response[_OFFSET_MEDIA_LENGTH],
        "media_type": _MEDIA_TYPES.get(response[_OFFSET_MEDIA_TYPE], "unknown"),
        "errors": (
            _decode_flags(response[_OFFSET_ERROR_1], _ERROR_1_FLAGS)
            + _decode_flags(response[_OFFSET_ERROR_2], _ERROR_2_FLAGS)
        ),
    }


async def _get_status_snmp() -> bytes:
    error_indication, error_status, _error_index, var_binds = await get_cmd(
        _get_snmp_dispatcher(),
        CommunityData(SNMP_COMMUNITY),
        await UdpTransportTarget.create((PRINTER_IP, 161)),
        ObjectType(ObjectIdentity(_STATUS_OID)),
    )

    if error_indication:
        raise OSError(f"SNMP error querying printer status: {error_indication}")
    if error_status:
        raise OSError(f"SNMP error querying printer status: {error_status.prettyPrint()}")

    return bytes(var_binds[0][1])


def print_label(template: int, fields: dict[str, str], copies: int = 1) -> dict:
    """Print a label from a pre-loaded template (1-99) with named field values.

    Fields are set by object name (^ON), not creation order — slower to
    send than positional insertion, but doesn't require the caller to know
    the template's internal object order, and is the same "more reliable"
    approach the old b-PAC integration used (GetObject(name) over index).
    """
    command = bytearray(_SELECT_PTOUCH_TEMPLATE_MODE)
    command += f"^TS0{template:02d}".encode("ascii")
    # ^ID resets the *currently selected* template's data — must come
    # after ^TS, not before, or it resets whatever template was left
    # selected from a previous call instead of the one we just chose.
    command += b"^ID"

    for name, value in fields.items():
        command += b"^ON" + name.encode("ascii") + b"\x00" + value.encode("ascii") + DELIMITER

    if copies > 1:
        command += f"^CN{copies:03d}".encode("ascii")

    command += b"^FF"

    _send(bytes(command))
    return {"printed": True}

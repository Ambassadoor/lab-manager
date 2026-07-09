"""Network communication with the Brother PT-P950NW label printer.

Kept separate from main.py so the FastAPI routes stay thin — this module
owns the P-touch Template command protocol and the raw socket I/O.

Printing requires a label template to already be transferred onto the
printer's own memory via P-touch Editor's Transfer Manager (a one-time,
manual, Windows-only step) — this module can only select a template by
its assigned number (1-99) and fill in its named objects, not create or
upload one.
"""

import os
import socket

PRINTER_IP = os.getenv("PRINTER_IP")
PRINTER_PORT = int(os.getenv("PRINTER_PORT", "9100"))
TIMEOUT_SECONDS = 5

STATUS_RESPONSE_SIZE = 32
DELIMITER = b"\x09"  # default P-touch Template field delimiter (tab)

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
    """Open a connection, send a command, optionally read a fixed-size
    response, close. One connection per operation, same pattern as
    balance.py's open-per-call approach for the serial port."""
    with socket.create_connection((PRINTER_IP, PRINTER_PORT), timeout=TIMEOUT_SECONDS) as sock:
        sock.sendall(data)
        if not response_size:
            return b""

        response = b""
        while len(response) < response_size:
            chunk = sock.recv(response_size - len(response))
            if not chunk:
                break
            response += chunk
        return response


def get_status() -> dict:
    """Query the printer's current status: media, battery, errors."""
    response = _send(b"^SR", response_size=STATUS_RESPONSE_SIZE)

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


def print_label(template: int, fields: dict[str, str], copies: int = 1) -> dict:
    """Print a label from a pre-loaded template (1-99) with named field values.

    Fields are set by object name (^ON), not creation order — slower to
    send than positional insertion, but doesn't require the caller to know
    the template's internal object order, and is the same "more reliable"
    approach the old b-PAC integration used (GetObject(name) over index).
    """
    command = bytearray(b"^ID")
    command += f"^TS0{template:02d}".encode("ascii")

    for name, value in fields.items():
        command += b"^ON" + name.encode("ascii") + b"\x00" + value.encode("ascii") + DELIMITER

    if copies > 1:
        command += f"^CN{copies:03d}".encode("ascii")

    command += b"^FF"

    _send(bytes(command))
    return {"printed": True}

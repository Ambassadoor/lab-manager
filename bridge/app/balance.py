"""Serial communication with the Adam CKT8UH USB balance.

Kept separate from main.py so the FastAPI routes stay thin — this module
owns all the pyserial specifics.
"""

import os
import re
import time

import serial
from serial.tools import list_ports

SERIAL_PORT = os.getenv("BALANCE_SERIAL_PORT", "COM4")
BAUD_RATE = int(os.getenv("BALANCE_BAUD_RATE", "9600"))
READ_TIMEOUT_SECONDS = 5

# Identifies the specific USB-to-serial adapter cable connecting this
# machine to the balance, so the right port is found automatically even if
# it gets plugged into a different USB socket. The balance itself speaks
# plain RS-232, which has no USB identity of its own — only the adapter
# cable's chip (FTDI FT232R here) is visible to USB enumeration.
# BALANCE_SERIAL_NUMBER is unique to this one physical cable (strongest
# match); VID/PID below just identify the chip model generally and are a
# broader fallback if no serial number is configured or exposed. If this
# specific cable is ever lost or swapped, both may need updating even
# though the balance itself hasn't changed.
BALANCE_SERIAL_NUMBER = os.getenv("BALANCE_SERIAL_NUMBER")
BALANCE_VID = 0x0403
BALANCE_PID = 0x6001

# Matches a reading like "12.34 g" -> ("12.34", "g")
WEIGHT_PATTERN = re.compile(r"(-?\d+\.?\d*)\s*([a-zA-Z]+)")


def find_balance_port() -> str | None:
    """Scan connected serial devices for the balance's USB-to-serial adapter.

    Returns None if it isn't currently connected/detectable, in which case
    callers should fall back to the configured BALANCE_SERIAL_PORT.
    """
    ports = list(list_ports.comports())

    for port in ports:
        if BALANCE_SERIAL_NUMBER and port.serial_number == BALANCE_SERIAL_NUMBER:
            return port.device

    for port in ports:
        if port.vid == BALANCE_VID and port.pid == BALANCE_PID:
            return port.device

    return None


def _open_port() -> serial.Serial:
    return serial.Serial(
        port=find_balance_port() or SERIAL_PORT,
        baudrate=BAUD_RATE,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
        timeout=READ_TIMEOUT_SECONDS,
    )


def read_weight() -> dict:
    """Read one weight sample from the balance."""
    with _open_port() as ser:
        line = ser.readline().decode(errors="ignore")

    if not line:
        raise serial.SerialException("Timed out waiting for a reading from the balance")

    match = WEIGHT_PATTERN.search(line)
    if not match:
        raise serial.SerialException(f"Could not parse balance output: {line!r}")

    return {"weight": float(match.group(1)), "unit": match.group(2)}


def tare() -> dict:
    """Zero the balance. It sends no acknowledgment, so we just give it a
    few seconds to settle before releasing the port."""
    with _open_port() as ser:
        ser.write(b"T\r\n")
        time.sleep(3)

    return {"tared": True}

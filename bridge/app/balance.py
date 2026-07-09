"""Serial communication with the Adam CKT8UH USB balance.

Kept separate from main.py so the FastAPI routes stay thin — this module
owns all the pyserial specifics.
"""

import os
import re
import time

import serial

SERIAL_PORT = os.getenv("BALANCE_SERIAL_PORT", "COM4")
BAUD_RATE = int(os.getenv("BALANCE_BAUD_RATE", "9600"))
READ_TIMEOUT_SECONDS = 5

# Matches a reading like "12.34 g" -> ("12.34", "g")
WEIGHT_PATTERN = re.compile(r"(-?\d+\.?\d*)\s*([a-zA-Z]+)")


def _open_port() -> serial.Serial:
    return serial.Serial(
        port=SERIAL_PORT,
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

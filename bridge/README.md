# Bridge

A small FastAPI service that runs on the lab PC. The web app calls it on
`localhost` to reach hardware the browser cannot access: the USB balance
and the Brother label printer.

## Stack
- FastAPI + Uvicorn
- pyserial (USB balance)
- pywin32 (Brother b-PAC) — install on the Windows lab PC only
- Poetry, Ruff

## Setup
```bash
cp .env.example .env                 # set the balance's serial port
poetry install --no-root
poetry add pywin32                   # Windows lab PC only — Brother printing
poetry run uvicorn app.main:app --port 8200 --reload
```

### If the balance's COM port changes
The balance connects over a USB-to-serial adapter cable (the balance
itself speaks plain RS-232 and has no USB identity of its own).
`BALANCE_SERIAL_PORT` is tied to *how Windows enumerated that adapter*,
which can change if it gets moved to a different USB port on the
stockroom computer (or sometimes just from being unplugged and
reconnected). As long as `BALANCE_SERIAL_NUMBER` is set in `.env`, the
bridge auto-detects the adapter's current port on every request and
`BALANCE_SERIAL_PORT` is only used as a fallback — no `.env` edit needed
when the port shifts.

If `BALANCE_SERIAL_NUMBER` isn't set yet, the adapter cable was ever
swapped for a different one, or `/balance/read` starts returning a 503,
find the current port and serial number with:

```bash
poetry run python -m serial.tools.list_ports -v
```

This lists every serial device Windows currently sees, including each
device's serial number. Set `BALANCE_SERIAL_NUMBER` in `.env` to the
adapter's value (or update `BALANCE_SERIAL_PORT` for a one-off manual
fix). Device Manager → Ports (COM & LPT) shows the port list too, if
you'd rather check without a terminal open — it just won't show serial
numbers.

## Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Liveness check |
| `/balance/read` | GET | Current weight from the USB balance |
| `/balance/tare` | POST | Zero the USB balance |
| `/print/label` | POST | Print a label on the Brother printer (stub) |

The printer handler is still a stub — the hardware spike proved it
feasible; wire up the real b-PAC logic here.

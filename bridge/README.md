# Bridge

A small FastAPI service that runs on the lab PC. The web app calls it on
`localhost` to reach hardware the browser cannot access: the USB balance
and the Brother label printer.

## Stack
- FastAPI + Uvicorn
- pyserial (USB balance)
- stdlib `socket` (Brother printer — P-touch Template protocol over plain
  TCP/IP, no SDK or Windows-only dependency needed)
- Poetry, Ruff

## Setup
```bash
cp .env.example .env                 # set the balance's serial port and printer IP
poetry install --no-root
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

### Printer setup

The printer must be on the **wired** network, not WiFi — some networks
firewall wireless clients off from wired device subnets, which is the
case on this one. Find its IP from the printer's own network status
screen (or its Web Based Management page once you know it:
`http://<printer_ip>/`) and set `PRINTER_IP` in `.env`. `PRINTER_PORT`
defaults to `9100`, the standard raw/JetDirect print port for this class
of network printer.

`GET /print/status` works with no further setup. `POST /print/label`
additionally requires a label template to already be transferred onto
the printer's own memory — a one-time, manual step using P-touch Editor's
Transfer Manager on Windows (not something this service can do). Each
transferred template gets an assigned number (1-99); pass that as
`template` in the request, along with a `fields` object mapping the
template's named objects (e.g. `Text1`, `Barcode1`) to their values.

## Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Liveness check |
| `/balance/read` | GET | Current weight from the USB balance |
| `/balance/tare` | POST | Zero the USB balance |
| `/print/label` | POST | Print a label from a pre-loaded template |
| `/print/status` | GET | Printer's media, battery, and error status |

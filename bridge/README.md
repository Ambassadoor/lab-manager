# Bridge

A small FastAPI service that runs next to the hardware: on the lab PC
(Windows) or, as of Sep 2026, the stockroom Raspberry Pi (Linux, behind
nginx at `/bridge/` — see `deploy/pi/`). The web app calls it to reach
hardware the browser cannot access: the USB balance and the Brother label
printer.

## Stack
- FastAPI + Uvicorn
- pyserial (USB balance)
- stdlib `socket` (Brother printer — P-touch Template protocol over plain
  TCP/IP for printing, no SDK or Windows-only dependency needed), or the
  printer's USB device on Linux (`PRINTER_CONNECTION=usb`)
- pysnmp (Brother printer — status/media/supply queries; the network
  print connection above doesn't support these, see Printer setup)
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

**On Linux (the Pi)** the adapter is `/dev/ttyUSB0` rather than a `COM`
port, and the same command reports its serial number **without** the
trailing `A` that Windows' FTDI driver adds (`BG01LURN` on Linux,
`BG01LURNA` on Windows) — set `BALANCE_SERIAL_NUMBER` to whichever form
the machine running the bridge shows. The device belongs to the `plugdev`
group there, so the user running the bridge must be in it.

**How reads work:** each `/balance/read` sends `P`, which makes the
balance send a short report (date, time, net/tare/gross weights); the
bridge returns its `Net Wt.` line, in about 0.2 s. If the report doesn't
come, it takes the balance's next automatic reading instead (every ~2 s).

### Printer setup

The printer must be on the **wired** network, not WiFi — some networks
firewall wireless clients off from wired device subnets, which is the
case on this one. Find its IP from the printer's own network status
screen (or its Web Based Management page once you know it:
`http://<printer_ip>/`) and set `PRINTER_IP` in `.env`.

**For `POST /print/label`:** in the printer's Web Based Management page,
under Network > Protocol, the raw printing protocol must be set to
**Raw**, not **LPR** — these are different wire protocols on different
ports (Raw is `PRINTER_PORT`, default `9100`; LPR is port 515 and won't
work with this bridge at all). This tripped us up once already — a
printer freshly added to a network often defaults to LPR. A label
template also needs to already be transferred onto the printer's own
memory — a one-time, manual step using P-touch Editor's Transfer Manager
on Windows (not something this service can do). Each transferred
template gets an assigned number (1-99); pass that as `template` in the
request, along with a `fields` object mapping the template's named
objects (e.g. `Text1`, `Barcode1`) to their values.

**For `GET /print/status`** (network connection): this uses SNMP, not the raw print
connection — Brother's own docs show the raw network connection only
supports one-directional print data, not status queries (that's a
USB/Bluetooth-only feature of the same command protocol). `PRINTER_SNMP_COMMUNITY`
defaults to `public`, the near-universal default for read-only SNMP;
only change it if the printer's SNMP settings have been customized away
from that.

### Printer over USB (Linux)

For a machine the network won't let reach the printer — the case for the
stockroom Pi — plug the printer into it by USB and set
`PRINTER_CONNECTION=usb` in `.env`. The bridge then writes the same
P-touch Template commands to the printer's USB device, found by Brother's
USB vendor id (set `PRINTER_USB_DEVICE`, e.g. `/dev/usb/lp0`, to pin it).
USB is bidirectional, so `GET /print/status` asks the printer directly
(`^SR`) and SNMP isn't used. The device belongs to the `lp` group, so the
user running the bridge must be in it. Templates still have to be on the
printer already. USB mode is Linux-only (it finds the device through
`/sys`); on Windows use the network connection.

`battery_level` in the status reads `4` on mains power and `255` on
battery.

## Running as a Windows service

`poetry run uvicorn ...` in a terminal only lasts as long as that terminal
stays open — for the stockroom computer, the bridge should start on its
own at boot and keep running (and restart itself if it ever crashes)
without anyone needing to remember to launch it. The standard way to do
that for an arbitrary process on Windows is [NSSM](https://nssm.cc/)
("Non-Sucking Service Manager") — a small free tool that wraps it as a
real Windows service, manageable via `services.msc` like any other one.

1. `poetry install --no-root` in this directory, if not already done.
2. Download NSSM from https://nssm.cc/, and either add `nssm.exe` to
   `PATH` or copy it into `scripts/`.
3. From an elevated (Run as Administrator) Command Prompt:
   ```
   scripts\install_service.bat
   ```
   This points the service at this project's own venv (`.venv\Scripts\
   python.exe`), sets it to start automatically at boot, restart on
   crash, and log to `service.log` in this directory. Safe to re-run any
   time to reinstall/reconfigure.
4. `scripts\uninstall_service.bat` removes it.

No third-party tool preferred? Windows' built-in **Task Scheduler** can do
the same job without installing anything: a task triggered "At startup"
(not tied to any particular user login), action = the same
`.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port
8200` command with this directory as its working directory, "Run whether
user is logged on or not" checked, and a restart-on-failure setting under
the task's Settings tab. It won't show up in `services.msc`, but is
otherwise equivalent for this purpose.

## Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Liveness check |
| `/balance/read` | GET | Current weight from the USB balance |
| `/balance/tare` | POST | Zero the USB balance |
| `/print/label` | POST | Print a label from a pre-loaded template |
| `/print/status` | GET | Printer's media, battery, and error status |

The bridge has no login. In development it only answers on `localhost`; on
the Pi, nginx exposes it at `/bridge/` to anyone who can reach the Pi.

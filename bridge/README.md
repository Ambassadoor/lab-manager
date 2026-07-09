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

## Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Liveness check |
| `/balance/read` | GET | Current weight from the USB balance |
| `/balance/tare` | POST | Zero the USB balance |
| `/print/label` | POST | Print a label on the Brother printer (stub) |

The printer handler is still a stub — the hardware spike proved it
feasible; wire up the real b-PAC logic here.

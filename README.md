# lab-manager

Monorepo for the Lab Manager application — an internal tool for managing
chemical inventory, waste, labels, scanning, scheduling, and lab operations
at a small university.

## Repository layout

| Folder | What it is | Stack |
|--------|------------|-------|
| `frontend/` | Single-page web app (desktop + phone) | React, Vite, TypeScript, MUI |
| `backend/`  | REST API and database | Django, DRF, PostgreSQL |
| `bridge/`   | Local hardware service next to the balance and printer | FastAPI, pyserial |
| `deploy/`   | Server configuration (systemd, nginx) for the Raspberry Pi | — |
| `docs/`     | Planning and reference documents | — |

The frontend talks to the backend over HTTP. It also talks to the bridge on
`http://localhost` to reach the USB balance and Brother label printer —
hardware a browser cannot access directly.

## Prerequisites

- Node.js 20+ and pnpm
- Python 3.14.5+ and Poetry
- PostgreSQL 14+

## First-time setup

### Backend
```bash
cd backend
cp .env.example .env                              # fill in DB credentials
# create the database, e.g.:  createdb labmanager
poetry install --no-root
poetry run python manage.py migrate
poetry run python manage.py createsuperuser
poetry run python manage.py runserver             # http://localhost:8000
```

### Frontend
```bash
cd frontend
cp .env.example .env
pnpm install
pnpm dev                                          # http://localhost:5173
```

### Bridge (only on the machine the balance and printer are attached to)
```bash
cd bridge
cp .env.example .env                              # balance serial port, printer IP or USB
poetry install --no-root
poetry run uvicorn app.main:app --port 8200 --reload
```
No Windows-only packages are needed; the printer is driven over the network
(or USB on Linux). See `bridge/README.md`.

## Authentication

The app uses Django session authentication. The frontend calls
`/api/auth/csrf/` once on load, then `/api/auth/login/`, `/api/auth/me/`,
and `/api/auth/logout/`.

## Deployment

Since Sep 30, 2026 the live app runs on a Raspberry Pi in the stockroom:
nginx serves the built frontend, the API (gunicorn) and the bridge from one
address, with nightly database backups to Google Drive. The walkthrough,
what differs from the original plan, and how to switch back to running
things as above are in
`docs/Lab Manager on a Raspberry Pi — Deployment Plan.md`; the installed
service and nginx files are in `deploy/pi/`. Local development is
unchanged: the commands above still apply.

## Continuity notes

This tool is meant to outlive its original author. Keep this repository in a
university-owned account, keep the stack boring and well-documented, and
update these READMEs whenever setup steps change. The full project plan
lives in `docs/`.

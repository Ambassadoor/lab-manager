# lab-manager

Monorepo for the Lab Manager application — an internal tool for managing
chemical inventory, waste, labels, scanning, scheduling, and lab operations
at a small university.

## Repository layout

| Folder | What it is | Stack |
|--------|------------|-------|
| `frontend/` | Single-page web app (desktop + phone) | React, Vite, TypeScript, MUI |
| `backend/`  | REST API and database | Django, DRF, PostgreSQL |
| `bridge/`   | Local hardware service on the lab PC | FastAPI, pyserial |
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

### Bridge (only on the lab PC)
```bash
cd bridge
cp .env.example .env                              # set the balance serial port
poetry install --no-root
poetry add pywin32                                # Windows only — Brother printing
poetry run uvicorn app.main:app --port 8200 --reload
```

## Authentication

The app uses Django session authentication. The frontend calls
`/api/auth/csrf/` once on load, then `/api/auth/login/`, `/api/auth/me/`,
and `/api/auth/logout/`.

## Continuity notes

This tool is meant to outlive its original author. Keep this repository in a
university-owned account, keep the stack boring and well-documented, and
update these READMEs whenever setup steps change. The full project plan
lives in `docs/`.

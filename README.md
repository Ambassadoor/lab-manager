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
| `deploy/`   | Server configuration (systemd, nginx) and the deploy script for the Raspberry Pi | — |
| `docs/`     | Planning and reference documents; start with `docs/README.md` | — |

The frontend talks to the backend over HTTP. It also talks to the bridge to
reach the USB balance and Brother label printer — hardware a browser cannot
access directly. In development the bridge is at `http://localhost:8200`;
on the live Pi it is at `/bridge/` on the same address as the app.

## Prerequisites

- Node.js 20+ and pnpm
- Python 3.14.5+ and Poetry
- PostgreSQL 14+

## First-time setup

### Git hooks
Run this once in every clone:
```bash
git config core.hooksPath .githooks
```
Without it the hooks in `.githooks/` never run, and the generated API files
go out of date.

- **pre-commit** runs `scripts/generate-api-types.sh`, which regenerates
  `backend/openapi.json` from the Django API and `frontend/src/types/api.ts`
  from that, and adds both files to the commit. It needs the backend and
  frontend set up first (the steps below) and takes a few seconds.
- **pre-push** runs the Prettier, ESLint, TypeScript and Ruff checks that CI
  runs, and stops the push if one fails. It also refuses to run while
  `frontend/`, `backend/` or `bridge/` have uncommitted changes, because it
  checks the files on disk rather than the commits; commit or
  `git stash -u` them first.

CI checks the same things on every pull request, and also fails if
`openapi.json` or `api.ts` is out of date, which happens when a commit is
made without the hooks.

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

Anyone with a Lipscomb email address can register, and starts as a Lab
Assistant (read-only). A Lab Manager raises the role on the Users page. To
make the first Lab Manager, create a superuser and set its role in Django
admin (`/admin/`). Roles are described in `docs/Roles_and_Permissions.md`.

## Branches

Work happens on `cp/<type>/<name>` branches, merged into `develop` by pull
request. `develop` is merged into `main` for a release, which gets a version
tag.

## Deployment

Since Sep 30, 2026 the live app runs on a Raspberry Pi in the stockroom:
nginx serves the built frontend, the API (gunicorn) and the bridge from one
address, with nightly database backups to Google Drive. Since Oct 1, 2026
that address is `https://app.cplabmanager.com`, which works from the campus
network only; the certificate and the domain are covered in
`deploy/pi/README.md`. The walkthrough,
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

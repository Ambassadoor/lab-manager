# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Three independent services share this monorepo. Each has its own virtualenv / lockfile and is deployed separately.

| Service | Stack | Port |
|---------|-------|------|
| `frontend/` | React 19, Vite, TypeScript, MUI, TanStack Query, React Router | 5173 |
| `backend/` | Django 6, DRF, PostgreSQL, session auth | 8000 |
| `bridge/` | FastAPI, pyserial (lab PC only) | 8200 |

## Commands

All backend/bridge commands run from their respective directory with Poetry.

### Backend

```bash
cd backend
poetry run python manage.py runserver      # dev server
poetry run pytest                          # all tests
poetry run pytest path/to/test_file.py    # single test file
poetry run ruff check .                    # lint
poetry run ruff format .                   # format
poetry run ruff format --check .           # format check (CI)
poetry run python manage.py migrate        # apply migrations
poetry run python manage.py makemigrations # create migrations
```

### Frontend

```bash
cd frontend
pnpm dev            # dev server
pnpm build          # type-check + production build
pnpm lint           # ESLint
pnpm format         # Prettier (write)
pnpm format:check   # Prettier (CI check)
```

### Bridge

```bash
cd bridge
poetry run uvicorn app.main:app --port 8200 --reload
poetry run ruff check .
poetry run ruff format .
```

## Architecture

### Request flow

The React SPA calls the Django backend REST API for all data. It also calls the bridge at `http://localhost:8200` to reach hardware the browser cannot touch directly (USB balance, Brother label printer). The bridge CORS allow-list is set to `FRONTEND_ORIGIN` — only the configured frontend origin is permitted.

The Bluetooth barcode scanner acts as an HID keyboard and requires no integration; it types into whatever input has focus. The Brady waste-label printer also requires no integration; Django generates a `.xlsx` file that the user feeds to Brady's own software.

### Authentication

Session-based. Frontend sequence on load:
1. `GET /api/auth/csrf/` — obtain CSRF token
2. `POST /api/auth/login/`
3. `GET /api/auth/me/`
4. `POST /api/auth/logout/`

### Data model (MVP entities)

- **Chemical** — catalog definition (CAS number, GHS hazards, default unit, etc.)
- **Container** — physical bottle; FK to Chemical and Location; has barcode, status, weight fields
- **Location** — self-referencing tree (`parent` FK, nullable at root) with a `location_type` enum
- **SDS** — file or URL, FK to Chemical (one-to-many; old versions are retained)
- **CheckoutEvent** — append-only audit log (container, user, action, timestamp)
- **WeightReading** — append-only balance history; usage is derived from deltas, never stored

The schema anticipates future features: `barcode` fields on Container and Location exist from day one; `WeightReading.source` distinguishes manual vs. balance readings.

### Linting / formatting

All Python services use **Ruff** with `line-length = 100`. Migrations are excluded from Ruff checks. Frontend uses ESLint + Prettier; `format:check` and `lint` both run in CI.

## Project context
The MVP for this project is the Capstone Project for a year long Full-Stack Development course. The MVP should be completed by the user with no code completion provided by LLMs, to show they have learned the skills needed for a junior developer. LLMs may be used for tasks such as; syntax confirmation, brainstorming, and basic explanations. Once the MVP has been achieved and the course instructor has signed off, LLMs may then be fully utilized. When in doubt, behave as an instructor providing guidance towards an answer rather than the answer itself. 

Current milestone: **MVP (Milestone 1) — Inventory + Locations** — replacing the Notion database. Full roadmap is in [docs/Lab-Manager-App-Project-Plan.md](docs/Lab-Manager-App-Project-Plan.md). Hardware integrations (balance serial protocol, Brother SDK via b-PAC/pywin32) are stubbed in `bridge/app/main.py` with TODO comments; the spikes confirmed they work but the wiring isn't complete yet.

# Backend

Django + Django REST Framework API.

## Stack
- Django + DRF
- PostgreSQL (psycopg2)
- Session authentication (CSRF-protected)
- Argon2 password hashing (Django's built-in hasher + argon2-cffi)
- django-filter (filter / search / ordering)
- drf-spectacular (generates `openapi.json`, which the frontend's types are built from)
- Google Drive API client (SDS files and database backups)
- gunicorn (production server on the Pi)
- Poetry, Ruff, pytest

## First-time setup
```bash
cp .env.example .env                              # fill in DB credentials
# create the PostgreSQL database, e.g.:  createdb labmanager
poetry install --no-root
poetry run python manage.py migrate
poetry run python manage.py createsuperuser
poetry run python manage.py runserver             # http://localhost:8000
```

The app runs without the Google Drive and GitHub settings in `.env`. SDS
upload needs the Drive ones, and bug reports are saved locally but not
sent to GitHub until the GitHub App ones are set
(see `docs/Bug-Reporting-Plan.md`).

## Layout
| Path | What it holds |
|------|---------------|
| `config/` | Settings and root URLs |
| `apps/users/` | Custom user model with a `role`, auth endpoints, the `role_at_least` permission factory |
| `apps/inventory/` | Chemicals, containers, locations, SDS, label templates. `models/`, `serializers/` and `views/` are packages split by domain. Also `filters.py`, `storage_rules.py` (storage-conflict warnings) and `drive.py` (Google Drive) |
| `apps/feedback/` | Bug reports and feedback, and sending them to GitHub as issues |
| `tests/` | pytest suite |
| `scripts/` | Standalone scripts, see below |
| `openapi.json` | Generated API schema. Do not edit by hand |

## API

All routes need a logged-in session unless marked public. What each role
may do is in `docs/Roles_and_Permissions.md`. `openapi.json` has the full
request and response shapes.

### Auth (`/api/auth/`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `csrf/` | GET | Sets the csrftoken cookie; call once on app load (public) |
| `login/` | POST | Logs in; returns the user (public) |
| `logout/` | POST | Ends the session |
| `me/` | GET, PATCH | The current user; PATCH edits their own profile |
| `register/` | POST | Creates an account for a Lipscomb email address, with the lowest role (public) |
| `validate/` | GET | Whether a username or email is already taken (public) |
| `users/` | GET, PATCH | List, view and edit other users, including their role (Lab Manager) |

### Inventory (`/api/inventory/`)
| Endpoint | Description |
|----------|-------------|
| `containers/` | CRUD, looked up by slug (`chem-292`; a scanned `CHEM-0292` also works). Extra actions: `check_out`, `check_in`, `weigh_in`, `weigh_in_bulk`, `transfer`, `is_discarded`, `is_valid` |
| `chemicals/` | CRUD, plus `check_cas` |
| `chemical_storage_categories/` | CRUD |
| `locations/` | CRUD, plus `menu`, `add_child`, `move`, `containers` |
| `location_types/` | CRUD |
| `weight_readings/` | CRUD |
| `sds/` | List and retrieve (public), create. No update or delete |
| `label_templates/` | CRUD for the registry of templates on the label printer |
| `dashboard/` | Read-only dashboard lists |

### Feedback (`/api/feedback/`)
| Endpoint | Description |
|----------|-------------|
| `reports/` | Create a bug report (public, rate-limited); list and retrieve (Lab Manager); `promote` sends one to GitHub |
| `general/` | Create feedback (public, rate-limited); list, retrieve and update (Lab Manager); `promote` sends one to GitHub |

## Commands
| Command | Description |
|---------|-------------|
| `poetry run python manage.py runserver` | Dev server (port 8000) |
| `poetry run pytest` | Run tests |
| `poetry run ruff check .` | Lint |
| `poetry run ruff format .` | Format |
| `poetry run python manage.py spectacular --file openapi.json` | Regenerate the API schema (the pre-commit hook does this) |
| `poetry run python manage.py backup_db` | Dump the database to `BACKUP_DIR`, remove dumps older than `BACKUP_KEEP_DAYS`, and upload to Drive if `BACKUP_DRIVE_FOLDER_ID` is set. Needs `pg_dump`. Run nightly by a systemd timer on the Pi |
| `poetry run python manage.py retry_github_issues` | Resend bug reports whose GitHub issue failed or got stuck. Not scheduled; run by hand |

## Scripts
Run from `backend/`. None of these is part of the running app.

| Script | Description |
|--------|-------------|
| `scripts/pubchem_enrich.py` | Looks up title, molecular weight, formula and IUPAC name on PubChem for a file of CAS numbers. Does not touch the database |
| `scripts/onetime/import_notion_data.py` | The original one-time import from Notion. Already run; kept for reference. Not safe to run again as-is |
| `scripts/onetime/reconcile_notion_data.py` | Brings Postgres up to date with later changes in Notion without wiping it |

The Notion scripts need `NOTION_SECRET` and `NOTION_DB_ID` in the environment.

## Adding an app
```bash
mkdir -p apps/<name>
poetry run python manage.py startapp <name> apps/<name>
```
Set `name = "apps.<name>"` in the app's `apps.py`, then add
`"apps.<name>"` to `INSTALLED_APPS`.

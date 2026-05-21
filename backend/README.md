# Backend

Django + Django REST Framework API.

## Stack
- Django + DRF
- PostgreSQL (psycopg2)
- Session authentication (CSRF-protected)
- Argon2 password hashing (Django's built-in hasher + argon2-cffi)
- django-filter (filter / search / ordering)
- Custom user model (`apps/users`) with a `role` field
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

## Auth endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/csrf/` | GET | Sets the csrftoken cookie; call once on app load |
| `/api/auth/login/` | POST | Logs in; returns the user |
| `/api/auth/logout/` | POST | Ends the session |
| `/api/auth/me/` | GET | Returns the current user |

## Commands
| Command | Description |
|---------|-------------|
| `poetry run python manage.py runserver` | Dev server (port 8000) |
| `poetry run pytest` | Run tests |
| `poetry run ruff check .` | Lint |
| `poetry run ruff format .` | Format |

## Adding an app
```bash
mkdir -p apps/<name>
poetry run python manage.py startapp <name> apps/<name>
```
Set `name = "apps.<name>"` in the app's `apps.py`, then add
`"apps.<name>"` to `INSTALLED_APPS`.

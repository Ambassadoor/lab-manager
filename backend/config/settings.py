import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("SECRET_KEY", "unsafe-dev-key-change-me")
DEBUG = os.getenv("DEBUG", "False") == "True"
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    # Third party
    "rest_framework",
    "corsheaders",
    "django_filters",
    # Local
    "apps.users",
    "apps.inventory",
    "apps.feedback",
    "drf_spectacular",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "labmanager"),
        "USER": os.getenv("DB_USER", "labmanager"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
    }
}

AUTH_USER_MODEL = "users.User"

# Argon2 first — Django ships the hasher; argon2-cffi provides the backend.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- CORS / CSRF -------------------------------------------------------------
# The frontend dev server runs on a different origin (port 5173), so it needs
# to be allowed for CORS and trusted for CSRF.
CORS_ALLOWED_ORIGINS = [FRONTEND_ORIGIN]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [FRONTEND_ORIGIN]

# Cookie behaviour. SECURE flags default to on whenever DEBUG is off (production
# requires HTTPS — which is also required for phone-camera scanning).
# COOKIE_SECURE overrides that for a production deploy still on plain HTTP:
# browsers never send Secure cookies over HTTP, so login would silently fail.
# `or` (not a getenv default) so an empty COOKIE_SECURE= also means "unset".
COOKIE_SECURE = (os.getenv("COOKIE_SECURE") or str(not DEBUG)) == "True"
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = COOKIE_SECURE
CSRF_COOKIE_SECURE = COOKIE_SECURE

# --- Reverse proxy -----------------------------------------------------------
# Behind nginx terminating HTTPS, Django only sees plain HTTP from 127.0.0.1.
# Trust nginx's X-Forwarded-Proto so request.is_secure() (and with it CSRF's
# HTTPS Referer checks and absolute URLs) reflects the browser's real scheme.
# Enable ONLY behind a proxy that always overwrites that header (nginx's
# proxy_params does); otherwise clients could claim HTTPS themselves.
# USE_X_FORWARDED_HOST stays off: proxy_params already passes the real Host.
if os.getenv("TRUST_PROXY_HEADERS", "False") == "True":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# --- Django REST Framework ---------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_METADATA_CLASS": "rest_framework.metadata.SimpleMetadata",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Scoped to the bug-report/feedback create actions only (see
    # apps/feedback/throttles.py) — no global throttling.
    "DEFAULT_THROTTLE_RATES": {
        "reports_anon": "5/hour",
        "reports_user": "30/hour",
    },
}

SPECTACULAR_SETTINGS = {
    # LabelTemplateField.Role and User.Role both have a field named "role" —
    # before LabelTemplateField existed, User.Role was the only "role"
    # enum in the schema and got the clean name "RoleEnum" for free. Adding
    # a second one means *both* now need an explicit name, or drf-spectacular
    # falls back to an opaque hash-suffixed name like "Role3f7Enum" for
    # whichever one it can't disambiguate (which one depends on how many
    # serializers reference it, not the model these actually make sense
    # to read from — hence overriding both rather than just the new one).
    "ENUM_NAME_OVERRIDES": {
        "RoleEnum": "apps.users.models.User.Role",
        "LabelTemplateFieldRoleEnum": "apps.inventory.models.LabelTemplateField.Role",
    },
}

# --- Google Drive (SDS file storage) -----------------------------------------
# Service account credentials + target folder for uploaded SDS files (see
# apps/inventory/drive.py). Both unset in dev until the account/folder exist;
# uploads fail with a clear error until then rather than at import time.
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE")
SDS_DRIVE_FOLDER_ID = os.getenv("SDS_DRIVE_FOLDER_ID")

# --- Database backups (`manage.py backup_db`) --------------------------------
# Nightly pg_dump into BACKUP_DIR, keeping BACKUP_KEEP_DAYS of files. When
# BACKUP_DRIVE_FOLDER_ID is set, each dump is also uploaded there (privately,
# unlike SDS files) with the same retention — a dead SSD takes local copies
# with it. Uses the same service account as SDS uploads.
BACKUP_DIR = os.getenv("BACKUP_DIR") or "/var/backups/labmanager"
BACKUP_KEEP_DAYS = int(os.getenv("BACKUP_KEEP_DAYS") or "14")
BACKUP_DRIVE_FOLDER_ID = os.getenv("BACKUP_DRIVE_FOLDER_ID")

# --- GitHub App (user bug reports -> issues) ---------------------------------
# A GitHub App installed on GITHUB_REPO with Issues: read & write. All unset in
# dev until the app exists; reports still save, with github_status="failed",
# and `manage.py retry_github_issues` sends them later. See apps/feedback/github.py.
GITHUB_APP_ID = os.getenv("GITHUB_APP_ID")
GITHUB_APP_INSTALLATION_ID = os.getenv("GITHUB_APP_INSTALLATION_ID")
GITHUB_APP_PRIVATE_KEY_FILE = os.getenv("GITHUB_APP_PRIVATE_KEY_FILE")
GITHUB_REPO = os.getenv("GITHUB_REPO", "Ambassadoor/lab-manager")

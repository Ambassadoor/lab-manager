#!/usr/bin/env bash
# Resets the test site's database to a copy of the live one, from the
# newest nightly backup or a dump you name. Run on the Pi, from the test
# checkout (README.md, Test site):
#
#   ssh -t labmanager /opt/lab-manager-test/deploy/pi/refresh-test-db.sh
#   ssh -t labmanager /opt/lab-manager-test/deploy/pi/refresh-test-db.sh /var/backups/labmanager/<name>.dump
#
# Everything done on the test site since the last refresh is lost. The
# copy includes real accounts, so people log in with their usual password.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIVE_BACKUPS="${LIVE_BACKUP_DIR:-/var/backups/labmanager}"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mRefresh failed: %s\033[0m\n' "$*" >&2; exit 1; }

env_value() {
  [[ -f "$REPO/backend/.env" ]] || return 0
  sed -n "s/^$1=//p" "$REPO/backend/.env" | tail -n 1 | tr -d "\"'\r[:space:]"
}
DB_NAME="$(env_value DB_NAME)"
DB_USER="$(env_value DB_USER)"
DB_HOST="$(env_value DB_HOST)"
DB_PORT="$(env_value DB_PORT)"
export PGPASSWORD="$(env_value DB_PASSWORD)"

# The one guard between this script and the live data: it only ever
# drops a database whose name ends in _test.
[[ "$DB_NAME" == *_test ]] ||
  fail "DB_NAME in $REPO/backend/.env is '$DB_NAME', not a *_test database. Run this from the test checkout."

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  # backup_db names dumps after the live database (<DB_NAME>-<date>.dump),
  # so take the newest of any name. In-progress ones end in .partial.
  # shellcheck disable=SC2012  # names are ours, no odd characters
  DUMP="$(ls -t "$LIVE_BACKUPS"/*.dump 2>/dev/null | head -n 1 || true)"
fi
[[ -f "$DUMP" ]] || fail "no dump found (looked in $LIVE_BACKUPS); pass one as the argument"

echo "Replacing $DB_NAME with $DUMP"

STOPPED=false
on_exit() {
  local status=$?
  (( status == 0 )) && return
  [[ "$STOPPED" == true ]] &&
    echo "The test API is stopped. Fix the problem and run this again." >&2
}
trap on_exit EXIT

step "Stopping the test API"
sudo systemctl stop labmanager-test-api
STOPPED=true

step "Recreating $DB_NAME"
# --force ends any connection left open (a psql session, say).
sudo -u postgres dropdb --if-exists --force "$DB_NAME"
sudo -u postgres createdb --owner="$DB_USER" "$DB_NAME"

step "Restoring"
# --no-owner: everything ends up owned by DB_USER, whoever owned it live.
pg_restore --no-owner --no-privileges --exit-on-error \
  --host="${DB_HOST:-localhost}" --port="${DB_PORT:-5432}" --username="$DB_USER" \
  --dbname="$DB_NAME" "$DUMP"

step "Migrating to this checkout's schema"
# develop can be ahead of the live site by a migration or two.
(cd "$REPO/backend" && .venv/bin/python manage.py migrate --no-input)

step "Starting the test API"
sudo systemctl start labmanager-test-api
STOPPED=false

printf '\n\033[32mThe test database is now a copy of %s.\033[0m\n' "$(basename "$DUMP")"

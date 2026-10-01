#!/usr/bin/env bash
# Deploys the latest code to the stockroom Pi. Run on the Pi, or from a
# laptop over SSH (-t so sudo can ask for a password when restarting):
#
#   ssh -t labmanager /opt/lab-manager/deploy/pi/deploy.sh          # pull the checked-out branch
#   ssh -t labmanager /opt/lab-manager/deploy/pi/deploy.sh v1.2.0   # deploy a tag, branch or commit
#
# Order matters: everything that can fail without touching the live site
# (pull, installs, frontend build) runs first. The running services keep
# serving the old code from memory until the restart at the end, and the
# new frontend is built beside the live one and swapped in, so a failed
# build never leaves nginx serving a half-written dist/.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="${1:-}"
# The address the app is reached by, for the health checks at the end:
# DEPLOY_URL if set, else FRONTEND_ORIGIN from backend/.env (in production
# that is the app's own address, e.g. https://app.cplabmanager.com), else
# plain HTTP on the Pi's first IP. The checks need the real name, since
# Django rejects hosts not in ALLOWED_HOSTS (localhost included) and plain
# HTTP only answers with a redirect once HTTPS is on.
env_origin() {
  [[ -f "$REPO/backend/.env" ]] || return 0
  sed -n 's/^FRONTEND_ORIGIN=//p' "$REPO/backend/.env" | tail -n 1 | tr -d "\"'\r[:space:]"
}
BASE_URL="${DEPLOY_URL:-$(env_origin)}"
BASE_URL="${BASE_URL:-http://$(hostname -I | awk '{print $1}')}"
BASE_URL="${BASE_URL%/}"

# Send the checks to this machine's nginx whatever DNS says, while still
# asking for the real name (which the certificate and Django both check).
# An IP address needs no lookup, so it is left alone.
CURL_RESOLVE=()
url_host="${BASE_URL#*://}"
url_host="${url_host%%/*}"
if [[ "$url_host" == *:* ]]; then
  url_port="${url_host##*:}"
  url_host="${url_host%%:*}"
elif [[ "$BASE_URL" == https://* ]]; then
  url_port=443
else
  url_port=80
fi
if [[ ! "$url_host" =~ ^[0-9.]+$ ]]; then
  CURL_RESOLVE=(--resolve "$url_host:$url_port:127.0.0.1")
fi

# A non-interactive SSH session skips most of the login profile, so
# poetry (~/.local/bin) and an nvm-installed node may not be on PATH.
export PATH="$HOME/.local/bin:$PATH"
if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi
# Poetry installs into an already-activated virtualenv instead of each
# project's own .venv, which would put the bridge's packages into the
# backend's environment (or vice versa).
unset VIRTUAL_ENV

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mDeploy failed: %s\033[0m\n' "$*" >&2; exit 1; }

cd "$REPO"
PREVIOUS="$(git rev-parse --short HEAD)"
RESTARTED=false

# On failure, say what state things were left in. The services are only
# restarted near the end, so before that the site is still running
# $PREVIOUS even though the files on disk may be newer.
on_exit() {
  local status=$?
  (( status == 0 )) && return
  if [[ "$RESTARTED" == true ]]; then
    echo "The services were restarted and are running the new code." >&2
  else
    echo "The services were not restarted; the site is still running $PREVIOUS." >&2
  fi
  if [[ "$(git rev-parse --short HEAD)" != "$PREVIOUS" ]]; then
    echo "To go back: $0 $PREVIOUS" >&2
  fi
}
trap on_exit EXIT

step "Checking the Pi's copy of the repo"
for tool in git poetry pnpm curl; do
  command -v "$tool" >/dev/null || fail "'$tool' not found on PATH"
done
# Local edits on the Pi would either block the pull or be silently
# deployed; untracked files (.env, secrets/) are expected and ignored.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  git status --short --untracked-files=no
  fail "the Pi has uncommitted changes to tracked files; commit or discard them first"
fi

step "Fetching"
git fetch --tags --prune origin
if [[ -n "$TARGET" ]]; then
  # A tag or commit leaves HEAD detached; that's fine for a deploy.
  git checkout --quiet "$TARGET"
  # A branch name checks out the local branch, which may be behind origin.
  if git symbolic-ref -q HEAD >/dev/null; then
    git merge --ff-only --quiet "@{upstream}"
  fi
else
  git symbolic-ref -q HEAD >/dev/null ||
    fail "HEAD is detached (last deploy was a tag or commit); pass the tag, branch or commit to deploy"
  git merge --ff-only --quiet "@{upstream}"
fi
CURRENT="$(git rev-parse --short HEAD)"

if [[ "$CURRENT" == "$PREVIOUS" ]]; then
  echo "Already at $CURRENT; reinstalling and restarting anyway."
else
  echo "Deploying $PREVIOUS -> $CURRENT:"
  git log --oneline "$PREVIOUS..$CURRENT" | sed 's/^/  /'
fi

step "Installing backend and bridge dependencies"
(cd backend && poetry install --no-interaction)
(cd bridge && poetry install --no-interaction)

step "Building the frontend"
(
  cd frontend
  pnpm install --frozen-lockfile
  rm -rf dist-next
  pnpm exec tsc -b
  pnpm exec vite build --outDir dist-next
)

step "Backing up the database"
# Before migrate, so a bad migration can be undone with a restore (see
# the deployment plan's Backups section). Same command the nightly timer
# runs; it also uploads to Drive.
(cd backend && .venv/bin/python manage.py backup_db)

step "Migrating and collecting static files"
(
  cd backend
  .venv/bin/python manage.py migrate --no-input
  .venv/bin/python manage.py collectstatic --no-input
)

step "Switching to the new frontend"
(
  cd frontend
  rm -rf dist-prev
  [[ -d dist ]] && mv dist dist-prev
  mv dist-next dist
)

step "Restarting services"
sudo systemctl restart labmanager-api labmanager-bridge
RESTARTED=true

step "Checking the app responds at $BASE_URL"
check() {
  # gunicorn takes a few seconds to start its workers, so retry briefly.
  for _ in {1..15}; do
    # Exactly 200: a redirect (plain HTTP once HTTPS is on) proves nothing.
    code="$(curl -sS -o /dev/null -w '%{http_code}' "${CURL_RESOLVE[@]}" "$BASE_URL$1" || true)"
    if [[ "$code" == 200 ]]; then
      echo "  ok  $1"
      return 0
    fi
    sleep 1
  done
  echo "  FAILED  $1" >&2
  return 1
}
healthy=true
check / || healthy=false
check /api/auth/csrf/ || healthy=false
check /bridge/health || healthy=false

if [[ "$healthy" != true ]]; then
  fail "new code is running but not responding; check journalctl -u labmanager-api -u labmanager-bridge"
fi

printf '\n\033[32mDeployed %s.\033[0m Previous: %s (frontend kept in frontend/dist-prev).\n' \
  "$CURRENT" "$PREVIOUS"

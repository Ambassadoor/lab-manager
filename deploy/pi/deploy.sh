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
# The address the app is reached by. Health checks go through nginx with
# this as the Host, since Django rejects hosts not in ALLOWED_HOSTS
# (localhost included).
HEALTH_HOST="${DEPLOY_HOST:-$(hostname -I | awk '{print $1}')}"

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

step "Checking the app responds at http://$HEALTH_HOST"
check() {
  # gunicorn takes a few seconds to start its workers, so retry briefly.
  for _ in {1..15}; do
    if curl -fsS -o /dev/null "http://$HEALTH_HOST$1"; then
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

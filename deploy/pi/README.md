# Raspberry Pi deployment files

Copies of the files installed on the stockroom Pi (Sep 30, 2026). The full
walkthrough, including what differs from the original plan and how to
switch back to the pre-Pi setup, is in
[docs/Lab Manager on a Raspberry Pi — Deployment Plan.md](../../docs/Lab%20Manager%20on%20a%20Raspberry%20Pi%20—%20Deployment%20Plan.md).

| File | Installed at | Does |
|------|--------------|------|
| `labmanager-api.service` | `/etc/systemd/system/` | Django under gunicorn on `127.0.0.1:8000` |
| `labmanager-bridge.service` | `/etc/systemd/system/` | Hardware bridge under uvicorn on `127.0.0.1:8200` |
| `labmanager-backup.service` | `/etc/systemd/system/` | One run of `manage.py backup_db` |
| `labmanager-backup.timer` | `/etc/systemd/system/` | Runs the backup nightly at 02:00 (or at next boot if missed) |
| `labmanager.nginx` | `/etc/nginx/sites-available/labmanager`, symlinked into `sites-enabled/` | One origin on port 80: SPA, `/api/`, `/admin/`, `/static/`, `/bridge/` |
| `deploy.sh` | Run in place from the repo | Updates the Pi to the latest code (see [Deploying updates](#deploying-updates)) |

The services run as `User=ambassadoor`; change that line for a different
account. That account needs the `plugdev` group (balance adapter) and `lp`
group (USB printer).

## Install

```bash
sudo cp deploy/pi/*.service deploy/pi/*.timer /etc/systemd/system/
sudo cp deploy/pi/labmanager.nginx /etc/nginx/sites-available/labmanager
sudo ln -s /etc/nginx/sites-available/labmanager /etc/nginx/sites-enabled/labmanager
sudo rm /etc/nginx/sites-enabled/default        # the stock site claims port 80 too
sudo install -d -m 700 -o ambassadoor -g ambassadoor /var/backups/labmanager
sudo systemctl daemon-reload
sudo systemctl enable --now labmanager-api labmanager-bridge labmanager-backup.timer
sudo nginx -t && sudo systemctl reload nginx
```

## Deploying updates

From a laptop (`-t` lets `sudo` ask for the Pi password when it restarts the services):

```bash
ssh -t labmanager /opt/lab-manager/deploy/pi/deploy.sh          # pull the Pi's checked-out branch
ssh -t labmanager /opt/lab-manager/deploy/pi/deploy.sh v1.2.0   # or deploy a tag, branch or commit
```

Or run `/opt/lab-manager/deploy/pi/deploy.sh` on the Pi itself. Either way it:

1. Stops if the Pi has local edits to tracked files (`.env` files and `secrets/` are untracked, so they don't count).
2. Fetches, then fast-forwards the current branch or checks out the given ref, and lists the commits being deployed.
3. Installs backend and bridge dependencies, and builds the frontend into `frontend/dist-next`, beside the live `dist/`.
4. Backs up the database with `manage.py backup_db`, the same command as the nightly timer, which also uploads to Drive.
5. Runs `migrate` and `collectstatic`, moves the old `dist/` to `dist-prev/` and puts the new build in its place.
6. Restarts `labmanager-api` and `labmanager-bridge`, then checks `/`, `/api/auth/csrf/` and `/bridge/health` through nginx.

If a step before the restart fails, the site keeps running the old code. The script says which state it stopped in and prints the command to go back.

**Rolling back** is `deploy.sh <previous commit or tag>`. That puts back the old code, but not the old database: if the bad deploy ran a migration, restore the backup taken at step 4 (see Backups in the deployment plan).

**Deploy when nobody's using the app.** The restart takes the app down for a few seconds.

**Health checks** use the Pi's first IP address as the host, since Django only answers to names in `ALLOWED_HOSTS`. If that ever picks the wrong address, set it yourself: `DEPLOY_HOST=10.200.61.211 deploy.sh`.

## Uninstall (switching back)

```bash
sudo systemctl disable --now labmanager-api labmanager-bridge labmanager-backup.timer
sudo rm /etc/nginx/sites-enabled/labmanager
sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
sudo systemctl reload nginx
```

This stops the app on the Pi but leaves the database, `.env` files and
backups in place.

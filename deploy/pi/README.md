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

## Uninstall (switching back)

```bash
sudo systemctl disable --now labmanager-api labmanager-bridge labmanager-backup.timer
sudo rm /etc/nginx/sites-enabled/labmanager
sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
sudo systemctl reload nginx
```

This stops the app on the Pi but leaves the database, `.env` files and
backups in place.

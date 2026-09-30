# Lab Manager on a Raspberry Pi — Deployment Plan

Sep 29, 2026 · @Caleb

> **Status (Sep 30, 2026): live on the Pi as an interim setup.** Every phase is done and the go-live checklist passed. Where the build differs from the steps below, an **As built** note follows the phase; the original steps are kept unchanged, since a more official setup may follow once IT responds. Switching back to the pre-Pi setup is covered in [Switching back](#switching-back-to-the-pre-pi-setup). The installed service and nginx files are in `deploy/pi/`.

## Goal and architecture

The goal is to move Lab Manager off the dev laptop onto a Raspberry Pi in the stockroom. There, it serves the whole lab from one address, and the balance plugs straight into it. nginx serves all three parts from one origin, so the CORS and per-IP `.env` juggling of the dev setup goes away.

&#91;embedded content: target architecture · one Pi, one origin\]

Browsers only ever talk to nginx on port 80. It hands `/api/` to Django, `/bridge/` to the hardware bridge, and everything else to the built frontend. The bridge reaches the balance over USB and the printer over the network.

> **As built:** the printer is plugged into the Pi by **USB**, not reached over the network. The campus network refuses every connection from the Pi (`10.200.x.x`) to the printer (`10.113.50.36`), while the stockroom computer reaches it fine. The refusal comes from the router next to the Pi, and follows the Pi's registered hardware address rather than the wall jack. An IT request to allow it has been open for two weeks. The bridge supports both connections; see Phase 5.

## Prerequisites

Nothing gets installed until IT has approved a personal device on the campus wired network. Everything else is shopping.

- [x] Ask IT whether a personal Raspberry Pi may be plugged into the stockroom's wired network (MAC registration is common).
- [x] Ask IT for a DHCP reservation so the Pi's IP never changes; that IP becomes the app's address.
- [x] Ask IT whether a friendly hostname (e.g. `labmanager.lipscomb.edu`) is possible; optional.
- [x] Agree with the instructor or department on who owns the data and the Pi, and what happens when you leave.

| Item | Notes |
| --- | --- |
| Raspberry Pi 4 or 5 | 8 GB RAM (this build); plenty of headroom for the desktop, Postgres and both services |
| USB 3 SSD + enclosure (or Pi 5 NVMe HAT) | Postgres writes wear out SD cards; boot from the SSD |
| Official power supply | 27 W USB-C for a Pi 5, 15 W for a Pi 4; undervoltage causes random crashes |
| Case with cooling | Passive heatsink case or the Pi 5 active cooler |
| Ethernet cable | Same wired network as the printer (`10.113.50.36`) |
| USB-to-serial adapter for the balance | The one already used in the spike; note its serial number |
| Micro-SD card (small) | Only needed if the Pi can't boot from USB out of the box |

## Phase 1: Base Pi setup

The Pi runs 64-bit Raspberry Pi OS with the desktop, so it doubles as a workstation next to the balance; admin work can still happen over SSH. The one unusual step is Python: the repo requires 3.14.5+, newer than the OS ships.

1. Flash **Raspberry Pi OS** (64-bit) with desktop to the SSD (or keep the existing install if \`uname -m\` prints \`aarch64\`) with Raspberry Pi Imager. In Imager's settings, set the hostname (`labmanager`), your user, SSH with a public key, and the timezone.
2. Boot, SSH in, then update: `sudo apt update && sudo apt full-upgrade`.
3. System packages: `sudo apt install git nginx postgresql build-essential libpq-dev`.
4. Python 3.14 via uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`, then `uv python install 3.14`.
5. Poetry: `pipx install poetry` (or `uv tool install poetry`).
6. Node LTS + pnpm (for building the frontend): install Node from NodeSource or `nvm`, then `corepack enable`.
7. Serial access for the balance: `sudo usermod -aG dialout $USER`, then log out and back in.
8. Clone the repo to `/opt/lab-manager` and check out `develop`.
9. Firewall: `sudo apt install ufw`, allow `22` and `80` (and `443` later), then `sudo ufw enable`. Ports `8000`, `8200` and `5432` stay closed; only nginx faces the network.

> **As built:**
> - The Pi is on the campus wired network at `10.200.61.211`. That address has survived reboots and a move between jacks, but no DHCP reservation has been confirmed yet.
> - Step 7: the balance's FTDI adapter shows up as group `plugdev`, not `dialout`, and the USB printer as group `lp`. The service user is in both; `dialout` isn't needed for this adapter.
> - Step 8: the repo is on branch `cp/pi_server` (the Phase 2 changes), not `develop`, until that branch is merged.
> - No git identity is configured on the Pi; set `user.name` and `user.email` before committing there.

**Using the desktop as the stockroom station.** Once Phase 4 is done, open Chromium on the Pi at `http://localhost/` and pin it to the taskbar. Someone at the balance can then weigh and print without another computer. For a dedicated screen, add Chromium in kiosk mode to autostart (`chromium-browser --kiosk http://localhost/`). The desktop uses roughly 300 to 500 MB of extra RAM, which an 8 GB Pi absorbs easily.

## Phase 2: Code changes in the repo

Six small changes make the app servable from one origin. Do them on one branch off `develop`, before touching the Pi, and test them locally.

| # | Change | Why | Where |
| --- | --- | --- | --- |
| 1 | Move the inventory API from `/inventory/` to `/api/inventory/` | The SPA also has an `/inventory` route; on one origin nginx can't tell a page refresh from an API call | `backend/config/urls.py`, every `apiFetch('/inventory/…')` call, backend tests, `openapi.json` |
| 2 | Relative API and bridge URLs: `VITE_API_URL=` (empty) and `VITE_BRIDGE_URL=/bridge` | The browser calls whatever host served the page, so no IPs are baked into the build | `frontend/.env.production` (new); `client.ts` and `bridge.ts` already work, since `??` keeps an empty string |
| 3 | Make the cookie `Secure` flags their own env var (e.g. `COOKIE_SECURE`) instead of `not DEBUG` | Production needs `DEBUG=False`, but until HTTPS exists, Secure cookies are never sent and login silently fails | `backend/config/settings.py:112-113` |
| 4 | Add `package-mode = false` under `[tool.poetry]` | Stops the `No file/folder found for package` install error | `backend/pyproject.toml`, `bridge/pyproject.toml` |
| 5 | Add `gunicorn` to the backend dependencies | Production WSGI server; `runserver` is dev-only | `backend/pyproject.toml` |
| 6 | Add `SECURE_PROXY_SSL_HEADER` and a `USE_X_FORWARDED_HOST`-style setup, off by default | Needed once nginx terminates HTTPS, so Django knows the request was secure | `backend/config/settings.py` |

Change 6 can wait for the HTTPS step. The rest are needed on day one.

> **As built:** all six are done (commit `6f1aa50`). Differences:
> - Change 3: `COOKIE_SECURE` unset *or empty* keeps the old "secure unless `DEBUG`" behaviour, so copying `.env.example` can't silently turn it off.
> - Change 6: the setting is `TRUST_PROXY_HEADERS=True`, which turns on `SECURE_PROXY_SSL_HEADER`. `USE_X_FORWARDED_HOST` is deliberately left off: nginx's `proxy_params` already passes the real `Host` and never sets `X-Forwarded-Host`, so trusting it would only let clients choose it.
> - Moving the API under `/api/` also renamed the auth and feedback operation IDs in `openapi.json` (the `api_` prefix dropped). Nothing in the frontend uses them.
>
> Later commits on the same branch add USB printing and faster balance reads (`51a2bf1`) and nightly backups (`ba9f44b`).

## Phase 3: Database and secrets

The WSL database `lab_manager` moves over with one `pg_dump` / `pg_restore`. Once the Pi is live it becomes the only source of truth; the WSL copy is just for development.

1. On the Pi, create the role and database (use a new, strong password):

   ```bash
   sudo -u postgres createuser --pwprompt labmanager
   sudo -u postgres createdb -O labmanager lab_manager
   ```
2. In WSL, dump the current data:

   ```bash
   pg_dump -Fc -U labmanager -h localhost lab_manager > lab_manager.dump
   scp lab_manager.dump <user>@<pi-ip>:~
   ```
3. On the Pi, restore it, then apply any migrations the dump predates:

   ```bash
   pg_restore -U labmanager -h localhost -d lab_manager --no-owner lab_manager.dump
   cd /opt/lab-manager/backend && poetry run python manage.py migrate
   ```
4. Copy the secret files to `/opt/lab-manager/secrets/` with `chmod 600`: the Google service-account JSON and the GitHub App `.pem`.
5. Write `backend/.env` on the Pi:

   ```
   DEBUG=False
   SECRET_KEY=<new random value>
   ALLOWED_HOSTS=<pi-ip>,localhost
   FRONTEND_ORIGIN=http://<pi-ip>
   COOKIE_SECURE=False
   DB_NAME=lab_manager
   DB_USER=labmanager
   DB_PASSWORD=<from step 1>
   DB_HOST=localhost
   GOOGLE_SERVICE_ACCOUNT_FILE=/opt/lab-manager/secrets/<file>.json
   GITHUB_APP_PRIVATE_KEY_FILE=/opt/lab-manager/secrets/<file>.pem
   ```
6. Collect Django's static files (admin CSS): `poetry run python manage.py collectstatic`.

Generate `SECRET_KEY` fresh; don't reuse the dev one. `python -c "import secrets; print(secrets.token_urlsafe(50))"` works.

> **As built:**
> - **PostgreSQL 16, not Debian's 15.** WSL runs 16.15, and `pg_restore` 15 can't read a 16 dump ("unsupported version (1.15) in file header"). PostgreSQL's own apt repository was added (`/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh`), the empty 15 cluster dropped, and `postgresql-16` installed. The `postgresql` metapackage was removed on purpose: from that repository it follows the newest release, so `apt upgrade` would otherwise install a second, newer server. Keep the Pi and WSL on the same major version so dumps move both ways.
> - Step 2: `scp` needs the `:` after the host (`scp file user@<pi-ip>:~`). Without it, the copy is made locally under a file named after the host, and still reports success.
> - Step 4: `secrets/` is `chmod 700` and the key files `600`; `secrets/` is gitignored.
> - Step 5: `backend/.env` is `chmod 600` and also has `TRUST_PROXY_HEADERS=False` and `BACKUP_DRIVE_FOLDER_ID` (see Backups). `ALLOWED_HOSTS` and `FRONTEND_ORIGIN` use `10.200.61.211`.
> - Running the backend tests on the Pi needs a role that can create databases. `labmanager` deliberately can't; create a temporary role with `CREATEDB`, run `pytest` with `DB_USER`/`DB_PASSWORD` pointing at it, then drop it (182 tests passed this way on Sep 30).

## Phase 4: Services

Two systemd services (Django under gunicorn, the bridge under uvicorn) listen only on `127.0.0.1`. nginx is the single front door on port 80. Everything starts at boot and restarts on crash.

1. Install dependencies without dev tools, and build the frontend:

   ```bash
   cd /opt/lab-manager/backend && poetry install --only main
   cd /opt/lab-manager/bridge && poetry install --only main
   cd /opt/lab-manager/frontend && pnpm install && pnpm build
   ```
2. `/etc/systemd/system/labmanager-api.service`:

   ```ini
   [Unit]
   Description=Lab Manager API (gunicorn)
   After=network.target postgresql.service
   
   [Service]
   User=<user>
   WorkingDirectory=/opt/lab-manager/backend
   ExecStart=/opt/lab-manager/backend/.venv/bin/gunicorn config.wsgi --bind 127.0.0.1:8000 --workers 3
   Restart=on-failure
   
   [Install]
   WantedBy=multi-user.target
   ```
3. `/etc/systemd/system/labmanager-bridge.service`, same shape, with:

   ```ini
   WorkingDirectory=/opt/lab-manager/bridge
   ExecStart=/opt/lab-manager/bridge/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8200
   ```
4. `/etc/nginx/sites-available/labmanager` (symlink into `sites-enabled`, remove `default`):

   ```nginx
   server {
       listen 80 default_server;
       client_max_body_size 25m;   # SDS PDF uploads
       root /opt/lab-manager/frontend/dist;
   
       location /api/    { proxy_pass http://127.0.0.1:8000; include proxy_params; }
       location /admin/  { proxy_pass http://127.0.0.1:8000; include proxy_params; }
       location /static/ { alias /opt/lab-manager/backend/staticfiles/; }
       location /bridge/ { proxy_pass http://127.0.0.1:8200/; include proxy_params; }
       location /        { try_files $uri /index.html; }   # SPA routes
   }
   ```
5. Enable and start everything:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now labmanager-api labmanager-bridge
   sudo nginx -t && sudo systemctl reload nginx
   ```
6. Logs: `journalctl -u labmanager-api -f` and `journalctl -u labmanager-bridge -f`.

The trailing slash on `proxy_pass http://127.0.0.1:8200/` matters: it strips `/bridge` so the bridge still sees `/health`, `/print/label`, and so on.

> **As built:** the installed files are in `deploy/pi/`, with install and uninstall commands in its README. Differences from the snippets above:
> - `User=ambassadoor` in both services.
> - The API also has `Wants=postgresql.service`, so a reboot starts the database rather than just ordering after it.
> - nginx also listens on IPv6 (`listen [::]:80 default_server;`), as the stock site did.
> - Step 1: dev dependencies are installed too (`poetry install`, not `--only main`), so tests and Ruff run on the Pi.
> - While the services run, ports 8000 and 8200 are taken: stop the matching service before running `runserver` or the bridge's dev command on the Pi, or use another port.
> - `ALLOWED_HOSTS` must include every name the app is reached by. A request to `127.0.0.1:8000` directly gets a 400 because `127.0.0.1` isn't listed; that's expected.

## Phase 5: Balance and printer

The bridge code needs no changes for Linux, only different `.env` values. The printer talks over the network, and `pyserial` handles the balance on Linux.

`bridge/.env` on the Pi:

```
FRONTEND_ORIGIN=http://<pi-ip>
BALANCE_SERIAL_PORT=/dev/ttyUSB0
BALANCE_BAUD_RATE=9600
BALANCE_SERIAL_NUMBER=<adapter serial>
PRINTER_IP=10.113.50.36
PRINTER_PORT=9100
PRINTER_SNMP_COMMUNITY=public
```

- [ ] Plug in the balance's USB-serial adapter and confirm it appears: `ls /dev/ttyUSB*`.
- [ ] Get its serial number with `poetry run python -m serial.tools.list_ports -v` and set `BALANCE_SERIAL_NUMBER`, so a reboot that renames it to `ttyUSB1` doesn't break anything.
- [ ] Confirm the printer is reachable: `nc -zv 10.113.50.36 9100`.
- [ ] Restart the bridge: `sudo systemctl restart labmanager-bridge`.
- [ ] From the Pi: `curl localhost:8200/health`, then `curl localhost:8200/balance/read` and `curl localhost:8200/print/status`.

The printer's IP also needs a DHCP reservation, or the bridge loses it the next time it changes.

> **As built — printer over USB.** The Pi can't reach the printer over the network (see Goal and architecture), so the printer sits next to the Pi, plugged in by USB. `bridge/.env` on the Pi:
>
> ```
> PRINTER_CONNECTION=usb
> # PRINTER_USB_DEVICE=/dev/usb/lp0   # optional; unset = first Brother printer found on USB
> BALANCE_SERIAL_PORT=/dev/ttyUSB0
> BALANCE_SERIAL_NUMBER=BG01LURN
> ```
>
> - Over USB the bridge sends the same P-touch Template commands to `/dev/usb/lp0`, and reads status directly with `^SR` instead of SNMP. `PRINTER_IP`, `PRINTER_PORT` and `PRINTER_SNMP_COMMUNITY` stay in the file for switching back.
> - The printer's reported `battery_level` is `4` on mains power and `255` on battery.
> - The printer no longer needs a DHCP reservation while it's on USB; the Pi still does.
> - The adapter's serial number reads **`BG01LURN`** on Linux; Windows' FTDI driver shows it as `BG01LURNA`. The bridge also falls back to finding any FTDI adapter, so a wrong value doesn't break reads, but the right one makes the match exact.
> - `BALANCE_SERIAL_PORT` was `COM4`, copied from the Windows `.env`; on Linux it's `/dev/ttyUSB0`.
> - `nc` isn't installed on the Pi; `timeout 3 bash -c 'echo > /dev/tcp/<ip>/9100'` does the same reachability check.
> - Balance reads now send `P`, which makes the balance send a short report; the bridge takes its `Net Wt.` line (about 0.2 s) instead of waiting for the next automatic reading (up to about 2 s). Negative weights read correctly.

## Backups, updates and go-live checks

A nightly database dump that leaves the Pi is the one non-negotiable. A dead SSD with no off-device copy loses the whole inventory.

**Backups**

- Nightly cron at 02:00: `pg_dump -Fc lab_manager > /var/backups/labmanager/$(date +%F).dump`, keeping 14 days.
- Copy each dump off the Pi: `rclone` to the same Google Drive the SDS files use, or a department share.
- Test a restore into a scratch database once, before relying on it.

> **As built:** `manage.py backup_db`, run by `labmanager-backup.timer` (systemd, not cron) at 02:00. With `Persistent=true`, a run missed while the Pi was off happens at the next boot.
> - Dumps go to `/var/backups/labmanager` (`chmod 700`). Local copies older than 14 days are removed.
> - Each dump is also uploaded to **Lab Manager DB Backups**, a folder next to SDS Uploads in the shared drive, using the SDS service account (Content manager on that folder), without Rclone. Unlike SDS files, backups aren't shared by link. Drive copies older than 14 days are moved to the trash, which Drive empties after 30 days.
> - Settings: `BACKUP_DIR`, `BACKUP_KEEP_DAYS`, `BACKUP_DRIVE_FOLDER_ID` in `backend/.env`.
> - A failed dump or upload marks the run failed: `systemctl status labmanager-backup`, `journalctl -u labmanager-backup`.
> - The restore test passed on Sep 30: every row count matched the live database.
>
> To restore, as `postgres` (which can't read the backup folder, so feed the file in):
>
> ```bash
> sudo -u postgres createdb -O labmanager lab_manager_restore
> sudo -u postgres pg_restore -d lab_manager_restore --no-owner --role=labmanager < /var/backups/labmanager/<file>.dump
> ```

**Deploying an update** (a `deploy.sh` in the repo later):

1. `git pull` on `develop` (or a release branch).
2. `poetry install --only main` in `backend/` and `bridge/`; `pnpm install && pnpm build` in `frontend/`.
3. `manage.py migrate` and `manage.py collectstatic --noinput`.
4. `sudo systemctl restart labmanager-api labmanager-bridge`.

**Go-live checklist**

- [ ] `http://<pi-ip>/` loads from a lab computer, and refreshing on `/inventory/containers` doesn't 404.
- [ ] Log in and out; the CSRF-protected actions (create, edit) work.
- [ ] Upload and open an SDS file.
- [ ] Print a label from a computer that isn't the Pi.
- [ ] Read the balance from the app.
- [ ] Submit a test bug report; the GitHub issue appears.
- [ ] Reboot the Pi; everything comes back without manual steps.
- [ ] Tomorrow's backup file exists off the Pi.

> **As built:** all passed on Sep 30, 2026, with the printer on USB: page load and refresh, login, create and delete, SDS upload, bug report (GitHub issue created), label print from another computer, balance read (including a negative weight), and a reboot. The first scheduled backup runs Oct 1 at 02:00; manual runs through the same service already reached Drive.

## Switching back to the pre-Pi setup

Nothing about running the app the pre-Pi way was removed. Every new setting defaults to the old behaviour, and the Pi-only pieces (systemd, nginx, `.env.production`) are ignored by the dev servers. Verified on Sep 30: all backend tests pass, and `runserver`, `pnpm dev` and the bridge run side by side with the Pi services on spare ports.

### Local development (unchanged)

Same commands as the READMEs and `CLAUDE.md`:

| Part | Command | Notes |
|---|---|---|
| Backend | `poetry run python manage.py runserver` | `.env` with `DEBUG=True`; `COOKIE_SECURE` and `TRUST_PROXY_HEADERS` can stay unset |
| Frontend | `pnpm dev` | Reads `.env` (`VITE_API_URL=http://localhost:8000`, `VITE_BRIDGE_URL=http://localhost:8200`); `.env.production` is **not** used in dev |
| Bridge | `poetry run uvicorn app.main:app --port 8200 --reload` | `PRINTER_CONNECTION` unset = network, as before |

`poetry install --no-root` still works; plain `poetry install` now works too.

**One difference:** `pnpm build` now uses `.env.production` (relative URLs for nginx). To build for anywhere else, put the URLs in `frontend/.env.production.local`, which Vite applies last and git ignores.

### Printer back on the network

When IT allows the Pi to reach the printer, or the bridge moves to a machine that can:

1. Plug the printer into the wired network, and check its IP and that its raw protocol is **Raw** (see `bridge/README.md`).
2. In `bridge/.env`: `PRINTER_CONNECTION=network` (or delete the line), and `PRINTER_IP` set to its address.
3. Restart the bridge (`sudo systemctl restart labmanager-bridge` on the Pi) and check `/bridge/print/status`.
4. Ask IT for a DHCP reservation for the printer.

USB mode is Linux-only; on Windows the bridge must use the network printer.

### Moving the live app off the Pi

Back to the laptop and stockroom computer:

1. **Take a final backup** on the Pi: `cd /opt/lab-manager/backend && poetry run python manage.py backup_db`. The newest file in `/var/backups/labmanager/` (also in the Drive folder) is the data to move.
2. **Stop the Pi** serving: `sudo systemctl disable --now labmanager-api labmanager-bridge labmanager-backup.timer`, and switch nginx back to its default site (commands in `deploy/pi/README.md`). The database and backups stay on the Pi.
3. **Restore on WSL**, which runs the same PostgreSQL major version (16):
   ```bash
   dropdb lab_manager && createdb -O labmanager lab_manager   # replaces the WSL copy
   pg_restore -U labmanager -h localhost -d lab_manager --no-owner <file>.dump
   poetry run python manage.py migrate
   ```
4. **Bridge on the stockroom computer:** plug the balance in there, reconnect the printer to the network, and in its `bridge/.env` use `BALANCE_SERIAL_NUMBER=BG01LURNA` (the Windows form), its `COM` port as `BALANCE_SERIAL_PORT`, and `PRINTER_CONNECTION=network`. Run it as a Windows service per `bridge/README.md`.
5. **Frontend and backend** as in Local development, with `.env` values pointing at the laptop's IP as before.
6. **Backups** don't run anywhere after step 2. Run `manage.py backup_db` on the machine that now holds the data, on a schedule; with `BACKUP_DRIVE_FOLDER_ID` and the service-account key set, it still uploads to Drive. It needs `pg_dump` on the `PATH`.

The balance change (sending `P`) was tested only on the Pi. It's the same balance and serial settings, so it should behave the same on Windows, but try a read after switching.

## Open questions and risks

| Risk or question | Impact | Mitigation |
| --- | --- | --- |
| IT doesn't allow a personal server on the wired network | Plan blocked | Ask first; fallback is the stockroom PC running the same stack |
| Plain HTTP on the campus network | Session cookies travel unencrypted | Short term: `COOKIE_SECURE=False`. Longer term: HTTPS via an IT-issued certificate or an internal CA, then flip it back on |
| Pi or SSD fails | App down, possible data loss | Nightly off-device backups; a spare SD card image with the OS and repo set up |
| DHCP changes the Pi's or printer's IP | App unreachable or printing breaks | DHCP reservations for both |
| Data on personal hardware | Unclear ownership when you graduate | Written agreement with the department; a documented handover |
| Balance works only for the person standing at it | Weighing from another room reads the wrong container | Expected; the UI could name the balance's location on the weigh screen |

> **As built:** IT approved the Pi on the wired network, but as a personal device whose traffic to the printer is blocked. The printer is on USB until that changes. The printer's DHCP reservation isn't needed while it's on USB. Nightly off-device backups are in place.

No hostname from IT, so the app lives at the Pi's reserved IP. Still to decide: who else gets SSH access, and when to schedule the cut-over from the Notion import to the Pi as the live system.

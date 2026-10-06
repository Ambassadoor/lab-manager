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
| `labmanager.nginx` | `/etc/nginx/sites-available/labmanager`, symlinked into `sites-enabled/` | One origin, `https://app.cplabmanager.com` on port 443: SPA, `/api/`, `/admin/`, `/static/`, `/bridge/`. Port 80 only redirects there. Needs the certificate from [HTTPS](#https) first |
| `deploy.sh` | Run in place from the repo | Updates the Pi to the latest code (see [Deploying updates](#deploying-updates)) |

The services run as `User=ambassadoor`; change that line for a different
account. That account needs the `plugdev` group (balance adapter) and `lp`
group (USB printer).

## Install

Get the certificate first (see [HTTPS](#https)); `nginx -t` fails without it.

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

`labmanager` is an SSH alias. Set it up once on each laptop by adding this to `~/.ssh/config`:

```
Host labmanager
    HostName app.cplabmanager.com
    User ambassadoor
    HostKeyAlias labmanager
```

`HostKeyAlias` keeps the Pi's saved host key under the name `labmanager`, so changing `HostName` later doesn't trigger a host key warning. The name only resolves on the campus network, and not through a VPN.

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

**Health checks** request `/`, `/api/auth/csrf/` and `/bridge/health` at the app's own address and expect a 200 from each. The address is `FRONTEND_ORIGIN` from `backend/.env`, so it follows the Pi's configuration. To check a different one, set it yourself: `DEPLOY_URL=https://app.cplabmanager.com deploy.sh`. The checks go straight to the Pi's own nginx, so they don't depend on campus DNS.

`deploy.sh` does not install `labmanager.nginx` or the service files. After a deploy that changes one of them, copy it into place and reload by hand (the `cp` lines under [Install](#install), then `sudo nginx -t && sudo systemctl reload nginx`, or `sudo systemctl daemon-reload` and a restart for a service file).

## HTTPS

The app is served at `https://app.cplabmanager.com`. Three things make that work:

- **The name.** `cplabmanager.com` is registered at Cloudflare, which also hosts its DNS. The record `app` points at the Pi's campus address (`10.200.61.211`) and is set to **DNS only** (grey cloud). The address is private, so the name only leads anywhere from inside the campus network.
- **The certificate.** Issued by Let's Encrypt, which checks that we control the domain by asking for a temporary DNS record. `certbot` on the Pi creates that record through Cloudflare's API, so Let's Encrypt never needs to reach the Pi.
- **nginx** answers on 443 with that certificate and redirects port 80 to it.

### Getting the certificate (one time)

1. In the Cloudflare dashboard: My Profile → API Tokens → Create Token → the **Edit zone DNS** template, with Zone Resources limited to `cplabmanager.com`. A token scoped like this can change this domain's DNS records and nothing else.
2. On the Pi:

   ```bash
   sudo apt install certbot python3-certbot-dns-cloudflare
   sudo mkdir -p /etc/letsencrypt
   sudo install -m 600 /dev/null /etc/letsencrypt/cloudflare.ini
   sudoedit /etc/letsencrypt/cloudflare.ini     # one line:  dns_cloudflare_api_token = <the token>
   sudo certbot certonly --dns-cloudflare \
     --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
     -d app.cplabmanager.com \
     --deploy-hook "systemctl reload nginx"
   ```

   The certificate and key land in `/etc/letsencrypt/live/app.cplabmanager.com/`, where `labmanager.nginx` expects them. The token file is readable by root only and is not in the repo.
3. Open the port in the Pi's firewall:

   ```bash
   sudo ufw allow 443/tcp
   sudo ufw status            # 22, 80 and 443 allowed
   ```

   Without this, port 80 redirects browsers to a port that silently drops them: every other machine sees "site can't be reached" while `curl` on the Pi itself works.

### Renewal

A certificate lasts 90 days. The `certbot.timer` systemd unit, installed with the package, checks twice a day and renews once fewer than 30 days remain; the deploy hook then reloads nginx. Nothing needs doing by hand.

```bash
sudo certbot renew --dry-run          # a full rehearsal against Let's Encrypt's test servers
systemctl list-timers certbot.timer   # when it next runs
sudo certbot certificates             # what is installed and when it expires
```

**Nothing warns you if renewal starts failing.** Let's Encrypt no longer sends expiry emails. If browsers begin showing a certificate warning, run `sudo certbot renew` and read the error. The likely causes are a revoked or expired Cloudflare token, or the domain itself having lapsed.

### Django settings that go with it

In `backend/.env` on the Pi:

```
ALLOWED_HOSTS=app.cplabmanager.com,10.200.61.211,localhost
FRONTEND_ORIGIN=https://app.cplabmanager.com
TRUST_PROXY_HEADERS=True
# and no COOKIE_SECURE line, so the session and CSRF cookies are HTTPS-only
```

`bridge/.env` gets the same `FRONTEND_ORIGIN`. Restart `labmanager-api` after editing; a 400 from `/api/` while the page itself loads means Django did not pick up the new `ALLOWED_HOSTS` (check the file was saved). These and the nginx file must change together: HTTPS-only cookies on a plain HTTP site break login, and an HTTPS site with the old `FRONTEND_ORIGIN` fails every form submission's CSRF check.

### Handing this over

The domain is the one part of the deployment that costs money and can expire (about $10 a year, renewed in the Cloudflare account). Keep auto-renew on, and pass the Cloudflare account on with the project. If the domain lapses, the certificate can't renew and the app's address stops resolving.

### Going back to plain HTTP

```bash
cd /opt/lab-manager
git show d526778:deploy/pi/labmanager.nginx | sudo tee /etc/nginx/sites-available/labmanager
```

Then in `backend/.env` set `FRONTEND_ORIGIN=http://10.200.61.211`, `COOKIE_SECURE=False` and `TRUST_PROXY_HEADERS=False` (and `FRONTEND_ORIGIN` in `bridge/.env`), and:

```bash
sudo nginx -t && sudo systemctl restart labmanager-api labmanager-bridge && sudo systemctl reload nginx
```

Use the IP address afterwards. A browser that visited the HTTPS site keeps insisting on HTTPS for `app.cplabmanager.com` for up to a day (the `Strict-Transport-Security` header in the nginx file).

## Uninstall (switching back)

```bash
sudo systemctl disable --now labmanager-api labmanager-bridge labmanager-backup.timer
sudo rm /etc/nginx/sites-enabled/labmanager
sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
sudo systemctl reload nginx
```

This stops the app on the Pi but leaves the database, `.env` files and
backups in place.

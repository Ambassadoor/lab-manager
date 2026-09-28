# Bug Reporting & Feedback — Plan

Let non-technical users report bugs and give UI/UX feedback from inside the app,
with diagnostics captured automatically and bugs mirrored to GitHub issues.

## Decisions

| Question | Decision |
|---|---|
| Repo is public — what goes on GitHub? | Only what the user typed, plus page path (no query string), app version, impact, and the reporter's **role** (never name). Console logs, network errors, system info and stacks stay in **Django admin**; the issue links back by report number. |
| Feedback → GitHub? | No. Stored in the database; a lab manager can **promote** individual items to an issue. |
| Anonymous reports? | Allowed (login and SDS pages are public), with a stricter throttle. Anonymous *bug reports* are saved but **not** auto-posted — an unauthenticated endpoint writing straight to a public repo is a spam channel. A lab manager promotes them like feedback. |
| GitHub auth | **GitHub App** (Issues: read & write on this repo only). Token never reaches the browser. |

## Architecture

```
Browser                              Django  apps/feedback                    GitHub
───────                              ─────────────────────                    ──────
diagnostics ring buffer ─┐
system snapshot ─────────┼─► POST /api/feedback/reports/ ─► BugReport row ─► issue (logged-in
user's description ──────┘                                   (always saved)    reports only,
                             POST /api/feedback/general/ ─► Feedback row       on_commit)
                                                             └─ promote ─────► issue
```

Every report is saved first; GitHub is a second step. Failures are recorded as
`github_status="failed"` and retried with `manage.py retry_github_issues` or the
admin action.

## API

| Endpoint | Who | Notes |
|---|---|---|
| `POST /api/feedback/reports/` | anyone | throttled: 5/hr anon, 30/hr user |
| `GET /api/feedback/reports/[:id]/` | lab manager+ | includes diagnostics |
| `POST /api/feedback/reports/:id/promote/` | lab manager+ | create/retry issue |
| `POST /api/feedback/general/` | anyone | same throttles |
| `GET /api/feedback/general/[:id]/` | lab manager+ | |
| `PATCH /api/feedback/general/:id/` | lab manager+ | `status` only (new / triaged / done) |
| `POST /api/feedback/general/:id/promote/` | lab manager+ | |

`diagnostics` is a free-form JSON object capped at 256 KB server-side.

## Phases

### 1. Backend — done
`apps/feedback`: models, endpoints, throttling, GitHub App client, admin
(pretty-printed diagnostics, "Create / retry GitHub issue" action), retry
command, tests.

### 2. Capture layer (frontend `src/diagnostics/`)
Installed in `main.tsx` before `render()`.
- Ring buffer (~100 entries, ~50 KB): `console.error`/`warn` (pass-through),
  `window` `error` + `unhandledrejection`, `apiFetch` failures (method, path,
  status, message — never request bodies), `bridgeFetch` failures, global
  TanStack `QueryCache`/`MutationCache` `onError`, route-change breadcrumbs.
- Snapshot at submit: browser/OS, viewport/screen/zoom, theme, language,
  timezone, online, route, role, bridge printer status.
- App version: git SHA via Vite `define` (`__APP_VERSION__`);
  `build.sourcemap: 'hidden'` so prod stacks can be decoded.
- Scrub before send: never read `document.cookie`; redact `csrftoken`,
  `sessionid`, `password`, email patterns.

### 3. UI
- Navbar **Help** menu: "Report a problem", "Send feedback".
- `ErrorBoundary` (App.tsx): **"Report this problem"** button pre-filled with the crash.
- Bug dialog: *What went wrong?* (required) → *Details* → impact as three plain
  buttons ("I can't continue" / "Annoying but I can work around it" / "Minor")
  → "Include technical details" (on, with a "see what's sent" preview) →
  thanks screen with reference number. Note under the text fields that the
  description may be posted publicly.
- Feedback dialog: category chips, page (auto-filled, editable), text,
  "OK to follow up with me?".
- Regenerate `backend/openapi.json` + frontend types for the new endpoints.

### 4. Polish
Optional screenshot (`modern-screenshot`) + user-attached image; error
fingerprint (message + top stack frame) to comment on an existing open issue
instead of duplicating; in-app triage page for lab managers.

### 5. Close the loop (optional)
GitHub webhook (issue closed) → update report; "My reports" page for users.

## GitHub App setup (one-time, manual)

1. GitHub → Settings → Developer settings → **GitHub Apps** → New GitHub App.
   - Name: e.g. `lab-manager-reports`. Homepage URL: the repo URL.
   - **Webhook: uncheck Active** (not needed until phase 5).
   - Repository permissions → **Issues: Read and write**. Nothing else.
   - "Only on this account".
2. Create the app, note the **App ID**, then **Generate a private key** — a
   `.pem` downloads. Store it outside the repo (`*.pem` is gitignored anyway).
3. **Install App** → only `Ambassadoor/lab-manager`. The installation URL ends
   in `/installations/<id>` — that's the **installation ID**.
4. Create labels up front so they get colors: `user-report`, `bug`, `feedback`,
   `impact:blocking`, `impact:annoying`, `impact:minor`, `feedback:confusing`,
   `feedback:tedious`, `feedback:idea`, `feedback:other`.
5. In `backend/.env`:
   ```
   GITHUB_APP_ID=...
   GITHUB_APP_INSTALLATION_ID=...
   GITHUB_APP_PRIVATE_KEY_FILE=/abs/path/to/lab-manager-reports.pem
   GITHUB_REPO=Ambassadoor/lab-manager
   ```
6. Verify: create a bug report in Django admin, run the "Create / retry GitHub
   issue" action, confirm the issue appears.

In production, schedule `manage.py retry_github_issues` (e.g. hourly cron) to
sweep up anything that failed during a GitHub outage.

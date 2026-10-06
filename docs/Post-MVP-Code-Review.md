# Post-MVP Code Review

**Reviewed:** 1 October 2026, at commit `68b27ea` on `main`
**Scope:** the 124 non-merge commits since MVP sign-off (`40357e0`, 7 July 2026)
**Purpose:** a study guide for the code added with LLM help, so you can confirm you understand how each part works, and know where it is weakest.

Nothing in the code was changed for this review.

## Contents

1. [How to use this document](#1-how-to-use-this-document)
2. [Findings at a glance](#2-findings-at-a-glance)
3. [Baseline: what existed at sign-off](#3-baseline-what-existed-at-sign-off)
4. [System map](#4-system-map)
5. [Categories](#5-categories)
   1. [Hardware bridge: balance](#51-hardware-bridge-balance)
   2. [Hardware bridge: label printer](#52-hardware-bridge-label-printer)
   3. [Label printing in the app and the template registry](#53-label-printing-in-the-app-and-the-template-registry)
   4. [Scanning and container actions](#54-scanning-and-container-actions)
   5. [Weights, tare and computed container fields](#55-weights-tare-and-computed-container-fields)
   6. [SDS and Google Drive](#56-sds-and-google-drive)
   7. [Users, roles and permissions](#57-users-roles-and-permissions)
   8. [Search, filters and query performance](#58-search-filters-and-query-performance)
   9. [Storage categories and conflict warnings](#59-storage-categories-and-conflict-warnings)
   10. [Bug reports, feedback and diagnostics](#510-bug-reports-feedback-and-diagnostics)
   11. [Backend restructuring and tests](#511-backend-restructuring-and-tests)
   12. [Frontend structure and shared components](#512-frontend-structure-and-shared-components)
   13. [UI and UX changes](#513-ui-and-ux-changes)
   14. [Deployment and operations](#514-deployment-and-operations)
6. [Professional practice: project-wide](#6-professional-practice-project-wide)
7. [Stale documentation](#7-stale-documentation)
8. [Appendix: every commit, by category](#8-appendix-every-commit-by-category)

---

## 1. How to use this document

Read section 2 first. It lists the problems found, most serious first, and six of them deserve attention before anything else.

Then work through section 5 one category at a time. Each has the same seven parts:

| Part | What it is for |
|------|----------------|
| What changed | The feature in two or three sentences |
| How it works | The path a request takes through the real files, with links |
| Key files | Where to read |
| Check your understanding | Questions to answer from the code before opening the answer |
| Concerns | What looks wrong or fragile in this category |
| Compared with professional practice | What matches, what differs harmlessly, what a reviewer at a company would ask you to change |
| Commits | The commits to pull up with `git show <hash>` |

A suggested order, from the code that carries the most risk to the least: 5.7, 5.4, 5.14, 5.8, 5.5, 5.6, 5.9, then the rest.

Line numbers in the links are those of commit `68b27ea`. Once a file has changed they will be off; `git show 68b27ea:<path>` shows the file as it was reviewed.

### How each concern was checked

| Label | Meaning |
|-------|---------|
| **Verified (tested)** | I wrote a throwaway test, ran it against a temporary test database, and it behaved as described. The test file was kept out of the repo. |
| **Verified (measured)** | I ran a read-only query or timing against the live database on the Pi. |
| **Verified (read)** | I traced the code and can point at the lines, but did not run it. |
| **Worth a look** | It looks fragile or unusual, and I have not confirmed it causes a problem. |

Your own test suite was also run: **187 passed in 28 s**.

---

## 2. Findings at a glance

### Fix first

| # | Finding | Evidence | Where | Effort |
|---|---------|----------|-------|--------|
| 1 | **Every self-registered account becomes a Lab Manager.** Anyone who can reach the site and types an address ending in `@lipscomb.edu` gets full access, including user management and deletes. The address is never verified. | Verified (tested) | [users/views.py:130-134](../backend/apps/users/views.py#L130-L134) | Small |
| 2 | **Any logged-in user can delete any container** through the dashboard URL. `DashboardView` is a full `ModelViewSet`, so `DELETE /api/inventory/dashboard/<id>/` works for the lowest role and removes the container with its weight readings, checkout events and SDS rows. | Verified (tested) | [views/dashboard.py:11-15](../backend/apps/inventory/views/dashboard.py#L11-L15) | Small |
| 3 | **Scanning a label fails for 968 of 1,131 containers.** Labels are zero-padded (`CHEM-0292`) and the barcode carries the padded form, but check-out, check-in and transfer look up the unpadded slug (`chem-292`) and answer "not found". Typing `Chem-292` by hand works. | Verified (tested and measured) | [models/containers.py:52-56](../backend/apps/inventory/models/containers.py#L52-L56), [views/containers.py:133](../backend/apps/inventory/views/containers.py#L133), [views/containers.py:333-345](../backend/apps/inventory/views/containers.py#L333-L345) | Small |
| 4 | **Adding a container for a brand-new chemical returns a 500** unless both molecular weight and storage category are filled in. The form allows both to be blank. | Verified (tested) | [views/containers.py:245-258](../backend/apps/inventory/views/containers.py#L245-L258) | Small |
| 5 | **The container list takes about 23 seconds and 7,243 database queries** to build for the current 1,131 containers. There is no pagination, and each row costs six or seven queries. The Containers page and the "All locations" view both request it. | Verified (measured) | [serializers/containers.py:53-78](../backend/apps/inventory/serializers/containers.py#L53-L78) | Medium |
| 6 | **The hardware bridge has no login.** Anyone on the network who can reach the Pi can print labels or tare the balance through `/bridge/`. | Verified (read) | [labmanager.nginx:11](../deploy/pi/labmanager.nginx#L11), [bridge/app/main.py](../bridge/app/main.py) | Medium |

**Status, 1 October 2026:** findings 1 to 4 are fixed on the branch `cp/bugfix/review_findings`, each with regression tests. The `check_in` status-code bug from section 5.4 and the missing-`chemicals` 500 from finding 11 were fixed in passing. Findings 5 and 6 are open.

A caveat on finding 3: the test confirms the server rejects a padded id and that the app prints the padded label. I did not scan a physical label. Only four checkout events exist in the live database, so this path has had very little real use.

### Then these

| # | Finding | Evidence | Where | Severity |
|---|---------|----------|-------|----------|
| 7 | The site runs over plain HTTP, so passwords and session cookies cross the campus network unencrypted. Already listed as a known risk in the deployment plan. | Verified (read) | [labmanager.nginx:2](../deploy/pi/labmanager.nginx#L2), [settings.py:113](../backend/config/settings.py#L113) | Medium |
| 8 | Any logged-in user can rename or re-parent a location. Only create, delete, add-child and move are role-gated; update is not. | Verified (tested) | [views/locations.py:41-46](../backend/apps/inventory/views/locations.py#L41-L46) | Medium |
| 9 | A new mixture, and any new ingredient created with it, silently loses its storage category, so the storage warnings never fire for it. | Verified (tested) | [views/containers.py:217-243](../backend/apps/inventory/views/containers.py#L217-L243), [serializers/chemicals.py:34-40](../backend/apps/inventory/serializers/chemicals.py#L34-L40) | Medium |
| 10 | The "append-only" histories can be edited. A stockroom user can change a weight reading, and doing so rewrites its timestamp. | Verified (tested) | [models/containers.py:133](../backend/apps/inventory/models/containers.py#L133), [views/containers.py:468-479](../backend/apps/inventory/views/containers.py#L468-L479) | Medium |
| 11 | Custom endpoints read `request.data` by hand, so malformed input gives a 500 instead of a 400. | Verified (tested) | [views/containers.py:210-300](../backend/apps/inventory/views/containers.py#L210-L300) | Medium |
| 12 | A label containing a non-ASCII character (`°`, `µ`) crashes the print endpoint with a 500. A `^` in a value would be read by the printer as a command. | Verified (read) | [printer.py:279-285](../bridge/app/printer.py#L279-L285) | Medium |
| 13 | No frontend tests and no bridge tests. CI does not run on pull requests into `develop`, only after they merge. | Verified (read) | [backend.yml:3-9](../.github/workflows/backend.yml#L3-L9) | Medium |
| 14 | Nothing tells you when a nightly backup fails, and failed GitHub issue sends are never retried automatically. | Verified (read) | [labmanager-backup.service](../deploy/pi/labmanager-backup.service) | Medium |
| 15 | `percent_remaining` ignores the unit prefix, so a container entered in `kg`, `mg` or `L` would compute wrongly. Live data only uses `g` and `mL` today. | Verified (read and measured) | [models/containers.py:62-66](../backend/apps/inventory/models/containers.py#L62-L66) | Low now |
| 16 | "Latest SDS" sorts the revision number as text, so revision `10` sorts below revision `9`. | Verified (read) | [serializers/containers.py:62-65](../backend/apps/inventory/serializers/containers.py#L62-L65) | Low |
| 17 | Smaller items: a missing React `key` in Move, a delete dialog that promises to remove child locations when the server refuses, dead endpoints, a router rebuilt on each render. | Verified (read) | See sections 5.4, 5.12, 5.13 | Low |

**Status, 6 October 2026, finding 5:** fixed on the branch `cp/bugfix/list_query_counts`, together with the chemical list from section 5.8. Measured locally against a copy of production data (1,131 containers, 707 chemicals), through the full view:

| Endpoint | Queries before | Queries after | Time before | Time after |
|---|---|---|---|---|
| Container list | 7,243 | 5 | 8.9 s | 0.7 s |
| A location's containers | 7,246 | 8 | 9.5 s | 0.7 s |
| Chemical list | 3,227 | 3 | 2.0 s | 0.4 s |
| Dashboard | 551 | 15 | 0.3 s | 0.05 s |

The query count no longer depends on the number of rows: `Container.objects.for_display()` loads the newest reading, checkout event and SDS for a whole list with one `DISTINCT ON` query each, and computes the label padding once. Half of the remaining time turned out not to be the database: the nested location serializer built a new serializer for every node of every container's location subtree, about 20,700 per request. The response bodies for the two container lists are byte-identical to before. The chemical list and dashboard differ only where rows were tied (SDS with the same revision, containers with the same percentage), which are now ordered by id instead of by chance. No pagination was added; the full container list is still about 4.4 MB, mostly the nested location subtrees.

**Status, 1 October 2026, finding 7:** the repo side is done on the branch `cp/feature/https`. nginx serves `https://app.cplabmanager.com` with a Let's Encrypt certificate obtained through a Cloudflare DNS challenge, which needs neither a hostname from IT nor the Pi being reachable from the internet. Port 80 redirects, and the deploy script's health checks follow the configured address. The switch on the Pi itself (certificate, firewall, `.env` values, nginx file) is a manual runbook in [deploy/pi/README.md](../deploy/pi/README.md#https). It was run the same day with release `v1.1.0`, and checked from a second machine on the campus network: the page, the API and the bridge answer over HTTPS with the Let's Encrypt certificate, port 80 redirects, and the CSRF cookie carries the `Secure` flag. Finding 6 is unchanged: the bridge is now encrypted in transit but still has no login.

---

## 3. Baseline: what existed at sign-off

This is the code you wrote by hand, so it is listed only to show what the rest was built on.

- **Auth:** session login, CSRF bootstrap, registration with username and email pre-validation, a custom `User` with `role`.
- **Inventory models:** `Chemical`, `Ingredient` (mixtures), `ChemicalStorageCategories`, `Location` and `LocationTypes`, `Container`, `CheckoutEvent`, `WeightReading`, `SDS`.
- **API:** DRF `ModelViewSet`s in one `views.py`, one `serializers.py` and one `models.py`.
- **Frontend:** container table (ag-grid), container form with CAS lookup and mixtures, container detail, location tree, chemical list and detail, check-out and weigh-in forms, a first dashboard.
- **Tooling:** Ruff, ESLint, Prettier, a pre-commit hook that regenerates `openapi.json` and `src/types/api.ts`, and three GitHub Actions workflows.

Everything below is a change to that.

---

## 4. System map

### The three services on the Pi

```
Browser ──HTTP :80──> nginx
                        ├── /            → frontend/dist  (the built React app)
                        ├── /api/        → gunicorn :8000 (Django + DRF) ──> PostgreSQL 16
                        ├── /admin/      → gunicorn :8000
                        ├── /static/     → backend/staticfiles
                        └── /bridge/     → uvicorn :8200  (FastAPI) ──> balance (USB serial)
                                                                   └──> label printer (USB)
Django ──HTTPS──> Google Drive (SDS files, nightly backups)
Django ──HTTPS──> GitHub API   (bug reports as issues)
```

In development the three run on separate ports (5173, 8000, 8200) and the browser calls each directly, which is why CORS settings exist. In production nginx puts them on one origin, so CORS is not involved.

### Routes and where they are explained

| Route | Handler | Section |
|-------|---------|---------|
| `/api/auth/csrf/`, `login/`, `logout/`, `me/` | [users/views.py](../backend/apps/users/views.py) | Baseline, 5.7 |
| `/api/auth/register/`, `validate/` | [users/views.py](../backend/apps/users/views.py) | 5.7 |
| `/api/auth/users/` | `UserView` | 5.7 |
| `/api/inventory/containers/` and its actions `check_out`, `check_in`, `weigh_in`, `weigh_in_bulk`, `transfer`, `is_discarded`, `is_valid` | [views/containers.py](../backend/apps/inventory/views/containers.py) | 5.4, 5.5, 5.9 |
| `/api/inventory/chemicals/`, `chemical_storage_categories/` | [views/chemicals.py](../backend/apps/inventory/views/chemicals.py) | 5.9 |
| `/api/inventory/locations/` and `menu`, `add_child`, `move`, `containers` | [views/locations.py](../backend/apps/inventory/views/locations.py) | 5.4, 5.8 |
| `/api/inventory/weight_readings/`, `location_types/` | [views/containers.py](../backend/apps/inventory/views/containers.py), [views/locations.py](../backend/apps/inventory/views/locations.py) | 5.5 |
| `/api/inventory/dashboard/` | [views/dashboard.py](../backend/apps/inventory/views/dashboard.py) | 5.5 |
| `/api/inventory/sds/` | [views/sds.py](../backend/apps/inventory/views/sds.py) | 5.6 |
| `/api/inventory/label_templates/` | [views/labels.py](../backend/apps/inventory/views/labels.py) | 5.3 |
| `/api/feedback/reports/`, `general/` | [feedback/views.py](../backend/apps/feedback/views.py) | 5.10 |
| Bridge `/health`, `/balance/read`, `/balance/tare` | [bridge/app/main.py](../bridge/app/main.py) | 5.1 |
| Bridge `/print/label`, `/print/status` | [bridge/app/main.py](../bridge/app/main.py) | 5.2 |

Frontend routes are all declared in [App.tsx:97-183](../frontend/src/App.tsx#L97-L183).

---

## 5. Categories

### 5.1 Hardware bridge: balance

#### What changed

The bridge can now read a weight from the Adam CKT8UH balance and tare it. The frontend has a "read from scale" button on every weight field, and scanning a container during check-in reads the scale automatically.

#### How it works

1. A weight field renders [WeightField.tsx](../frontend/src/components/shared/WeightField.tsx). Its button calls a TanStack mutation that the parent page owns, so the page can trigger the same read after a scan ([WeighIn.tsx:234-258](../frontend/src/components/inventory/WeighIn.tsx#L234-L258)).
2. The mutation calls `getBalanceWeight` in [api/bridge.ts](../frontend/src/api/bridge.ts), which fetches `GET {VITE_BRIDGE_URL}/balance/read`. This wrapper is separate from the Django one because the bridge has no session or CSRF.
3. [main.py:41-47](../bridge/app/main.py#L41-L47) calls `balance.read_weight()` and converts a `SerialException` into HTTP 503.
4. [balance.py:41-57](../bridge/app/balance.py#L41-L57) finds the serial port. The balance speaks plain RS-232 and has no USB identity, so the code looks for the USB-to-serial adapter cable: first by its serial number (`BALANCE_SERIAL_NUMBER`), then by the FTDI chip's vendor and product id, then falls back to `BALANCE_SERIAL_PORT`.
5. [balance.py:71-97](../bridge/app/balance.py#L71-L97) opens the port, discards anything buffered, sends `P` to request a report, and reads lines for up to five seconds until one matches `WEIGHT_PATTERN` ([balance.py:38](../bridge/app/balance.py#L38)). That pattern accepts the report's `Net Wt.` line or a bare periodic reading, and nothing else.
6. Tare ([balance.py:100-107](../bridge/app/balance.py#L100-L107)) sends `T` and sleeps three seconds, because the balance sends no acknowledgement.

The port is opened and closed on every call. Nothing stays connected between requests.

#### Key files

- [bridge/app/balance.py](../bridge/app/balance.py): all serial logic
- [bridge/app/main.py](../bridge/app/main.py): the HTTP layer
- [frontend/src/api/bridge.ts](../frontend/src/api/bridge.ts): the fetch wrapper
- [frontend/src/components/shared/WeightField.tsx](../frontend/src/components/shared/WeightField.tsx): the shared field

#### Check your understanding

1. Why can't the bridge find the balance by its own USB identity, and what does it look for instead?
2. The balance is switched off and someone clicks "read from scale". Trace the error from `readline()` to the message the user sees.
3. Why does `read_weight` call `reset_input_buffer()` before sending `P`?
4. Two browsers ask for a reading in the same second. What coordinates them?

<details><summary>Answers</summary>

1. The balance is an RS-232 device; USB only sees the adapter cable's FTDI chip. The code matches the cable's serial number, then the chip's VID/PID, then the configured port name.
2. `readline()` times out and returns an empty string, the loop breaks, `read_weight` raises `SerialException("Timed out…")`, `main.py` turns it into a 503 with that text as `detail`, `bridgeFetch` throws an `Error` carrying the detail, and `WeightField`'s `onError` hands the message to the page's snackbar.
3. The balance auto-prints every couple of seconds. A stale line from before the container was put on the pan would otherwise be returned as the current weight.
4. Nothing. Each request opens the port itself. On Linux both opens succeed, and the two readers can take each other's lines.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| No lock around the serial port, so concurrent reads can interleave or one can receive the other's line. A tare holds a worker thread for three seconds. | Verified (read): [balance.py:60-68](../bridge/app/balance.py#L60-L68) | Low. One balance, one person standing at it. |
| The balance endpoints have no authentication (finding 6). A tare sent from another room zeroes the balance under whatever is on it. | Verified (read) | Medium |
| The negative-weight format was still unverified when the Pi went live, according to your deployment notes. | Worth a look: [balance.py:38](../bridge/app/balance.py#L38) | Low |
| No automated tests. `WEIGHT_PATTERN` and the report parsing are pure functions and easy to test with sample lines. | Verified (read) | Low |

#### Compared with professional practice

**Matches common practice**
- Thin HTTP routes with the device logic in its own module. This is the standard separation in FastAPI projects.
- Configuration through environment variables with an `.env.example`, as the Twelve-Factor App recommends.
- Device errors mapped to 503 Service Unavailable, which is the correct status for "the thing behind me is down".

**Differs, and that is fine here**
- Opening the port per request. A production instrument service would hold one connection and serialise access. With one balance and one user at a time, per-request is simpler and recovers from unplugging on its own.
- A fixed three-second sleep for tare. Acceptable when the device gives no acknowledgement.

**Differs, and worth changing**
- No tests for the parser. A handful of pytest cases over recorded balance output would take under an hour and would have caught the `Net Wt.` format question before going on site.
- No lock. A module-level `threading.Lock` around `_open_port()` use is about ten lines.

#### Commits

3 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `c311728` | 2026-07-08 | Implement USB balance read/tare in the bridge service | yes |
| `bf74b63` | 2026-07-08 | Wire the USB balance into the frontend and auto-detect its port | yes |
| `51a2bf1` | 2026-09-30 | feat(bridge): USB printing and faster balance reads *(also adds USB printing (5.2))* | yes |

---

### 5.2 Hardware bridge: label printer

#### What changed

The bridge drives the Brother PT-P950NW using the printer's own P-touch Template command language, replacing the earlier Windows-only b-PAC plan. It can print over the network or over USB, and reports media and error status.

#### How it works

The key idea: the label **layout** lives on the printer. You design a template in P-touch Editor on Windows, transfer it to the printer once, and it gets a number from 1 to 99. The app only sends "select template N, put this text in the object named X, print".

1. The frontend posts `{template, fields, copies}` to `/print/label` ([main.py:59-71](../bridge/app/main.py#L59-L71)).
2. [printer.py:264-293](../bridge/app/printer.py#L264-L293) builds one byte string:
   - `ESC i a 3` switches the printer into P-touch Template mode. It is sent every time because a command sent in the wrong mode is ignored without any error.
   - `^TS0NN` selects the template. `^ID` then clears that template's data. The order matters: `^ID` resets whichever template is currently selected.
   - For each field, `^ON<name>\0<value>\t` selects an object by name and fills it. A `\n` in the value becomes `^CR`, the printer's in-object line break.
   - `^CN` sets copies and `^FF` prints.
3. `_send` ([printer.py:121-127](../bridge/app/printer.py#L121-L127)) writes those bytes to a raw TCP socket on port 9100, or to the USB device file `/dev/usb/lpN`, depending on `PRINTER_CONNECTION`.
4. Status ([printer.py:212-245](../bridge/app/printer.py#L212-L245)) returns the same 32-byte structure by two routes. Over USB the bridge sends `^SR` and reads the reply. Over the network the raw port is one-way, so it asks by **SNMP** instead, a separate UDP protocol for querying device state. The bytes are decoded into media width, media type, battery and error flags.
5. Because the network print path is one-way, `{"printed": true}` only means the bytes were sent. The frontend's `printLabelChecked` ([api/bridge.ts:65-80](../frontend/src/api/bridge.ts#L65-L80)) asks for status straight afterwards and reports a failure if the printer now shows an error.

[bridge/PRINTER_PLAN.md](../bridge/PRINTER_PLAN.md) records the protocol details and the debugging history. Read it alongside the code.

#### Key files

- [bridge/app/printer.py](../bridge/app/printer.py): protocol, both transports, status decoding
- [bridge/PRINTER_PLAN.md](../bridge/PRINTER_PLAN.md): decisions and protocol notes
- [bridge/.env.example](../bridge/.env.example): every setting, with comments

#### Check your understanding

1. Why does status use SNMP over the network but `^SR` over USB?
2. What does a 200 response from `/print/label` prove, and what covers the gap?
3. Why must `^ID` come after `^TS`?
4. Which line makes a two-line location label possible?
5. The Pi finds the printer at `/dev/usb/lp1` after a reboot instead of `lp0`. What keeps printing working?

<details><summary>Answers</summary>

1. The network raw port only carries print data toward the printer and never answers. USB is bidirectional. SNMP is the route Brother documents for reading the same status structure over a network.
2. Only that the command bytes were written. `printLabelChecked` then reads the printer status and throws if it shows an error such as wrong or missing media.
3. `^ID` clears the data of the currently selected template. Sent first, it would clear whichever template the previous print left selected.
4. [printer.py:284](../bridge/app/printer.py#L284), which replaces `\n` with `^CR`.
5. `_find_usb_device` ([printer.py:136-148](../bridge/app/printer.py#L136-L148)) scans `/sys/class/usbmisc/lp*` for a device whose USB vendor id is Brother's (`04f9`), unless `PRINTER_USB_DEVICE` pins a path.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| Field values are encoded as ASCII. A non-ASCII character raises `UnicodeEncodeError`, which is not an `OSError`, so `main.py` does not catch it and the response is a 500. No current location name contains one. | Verified (read and measured): [printer.py:285](../bridge/app/printer.py#L285), [main.py:68-71](../bridge/app/main.py#L68-L71) | Medium |
| A `^` or a tab inside a value is passed through to the printer as a command or a field delimiter. | Verified (read): [printer.py:279-285](../bridge/app/printer.py#L279-L285) | Low |
| `template` and `copies` are plain `int` with no range. `copies=5000` formats as four digits and corrupts the `^CN` command. | Verified (read): [main.py:59-62](../bridge/app/main.py#L59-L62) | Low |
| The print endpoint has no authentication (finding 6). | Verified (read) | Medium |
| The status check after printing is best-effort. If it fails, the print is reported as successful. This is deliberate and commented. | Verified (read): [api/bridge.ts:68-71](../frontend/src/api/bridge.ts#L68-L71) | Low |
| No tests. `print_label`'s command assembly and the status decoding are pure and testable without hardware. | Verified (read) | Low |

#### Compared with professional practice

**Matches common practice**
- One transport-agnostic `_send` with two implementations behind it. This is the usual way to support two connection types.
- Decoding the status bytes with named offsets and flag tables instead of magic numbers.
- Writing the protocol research down next to the code.

**Differs, and that is fine here**
- Hand-rolling a printer protocol. A company would look for a vendor SDK first; here the SDK is Windows-only and the Pi is Linux, so the raw protocol is the practical choice.
- SNMP with the default `public` community. Normal for read-only printer status on an internal network.

**Differs, and worth changing**
- Unvalidated request model. Pydantic's `Field(ge=1, le=99)` on `template` and `Field(ge=1, le=999)` on `copies` is two lines.
- No input sanitising. Reject or strip `^`, tab and non-ASCII before building the command, and catch `ValueError` so a bad label is a 400 with a readable message.
- `target-version = "py311"` in [bridge/pyproject.toml](../bridge/pyproject.toml) while the project requires Python 3.14. Ruff is linting for the wrong version.

#### Commits

7 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `187df9c` | 2026-07-08 | chore: update poetry.lock and pyproject.toml for pywin32 package *(pywin32 was for the b-PAC approach, dropped the next day)* |  |
| `cac03b1` | 2026-07-09 | feat: integrate Brother PT-P950NW label printer support with P-touch Template protocol |  |
| `fd4e68f` | 2026-07-09 | Move printer status query from raw socket to SNMP | yes |
| `a00809c` | 2026-07-10 | feat: implement label printing functionality and update printer integration |  |
| `0885a80` | 2026-07-10 | feat: remove failed print job cancellation attempts and update documentation |  |
| `e3e58bf` | 2026-09-14 | docs(bridge): add PT-P950NW user guide, fold findings into PRINTER_PLAN |  |
| `b61905c` | 2026-09-30 | fix(bridge): send label line breaks as ^CR | yes |

---

### 5.3 Label printing in the app and the template registry

#### What changed

Print buttons now exist on the container form, container table, container detail and location tree. A nav-bar indicator shows printer health. Template numbers and object names are no longer hardcoded: a `LabelTemplate` table records which templates are on the printer, and the app picks one by matching the tape that is loaded.

#### How it works

1. **The registry.** [models/labels.py](../backend/apps/inventory/models/labels.py) has `LabelTemplate` (name, kind `container` or `location`, template number, media width) and `LabelTemplateField` (a role, `barcode` or `text`, and the object name inside the template). Two database constraints keep it unambiguous: one template per kind per width, and one field per role per template.
2. **Managing it.** Lab managers use `/label-templates` ([LabelTemplates.tsx](../frontend/src/components/labels/LabelTemplates.tsx), [LabelTemplateDialog.tsx](../frontend/src/components/labels/LabelTemplateDialog.tsx)). The serializer writes the nested `fields` list by hand ([serializers/labels.py:33-52](../backend/apps/inventory/serializers/labels.py#L33-L52)); an update deletes and recreates the field rows.
3. **Printing.** Every print goes through `resolveAndPrint` in [printTemplates.ts:12-33](../frontend/src/components/shared/printTemplates.ts#L12-L33):
   - fetch the printer status and the templates of the right kind, in parallel
   - pick the template whose `media_width_mm` equals the loaded tape's width, or throw a readable error
   - map each role's value onto that template's object name
   - call `printLabelChecked`
4. **What goes on a label.** A container label's barcode is the JSON string `{"id":"CHEM-0292"}` and its text is the label id. A location label's barcode is `{"id":"LOC-12"}` and its text is the full path with `Loc-12` on a second line ([printTemplates.ts:35-56](../frontend/src/components/shared/printTemplates.ts#L35-L56)).
5. **Feedback.** Each page owns one print mutation and renders [PrintResultSnackbar.tsx](../frontend/src/components/shared/PrintResultSnackbar.tsx), which derives "open" from the mutation's state. When the page navigates away straight after printing (the container form), the result is stashed in `sessionStorage` by [pendingActionResult.ts](../frontend/src/components/shared/pendingActionResult.ts) and shown by the destination page.
6. **Status.** [PrinterStatusIndicator.tsx](../frontend/src/components/nav/PrinterStatusIndicator.tsx) polls `/print/status` every 30 seconds for stockroom users and up, and is refetched after every print.

#### Key files

- [backend/apps/inventory/models/labels.py](../backend/apps/inventory/models/labels.py)
- [backend/apps/inventory/serializers/labels.py](../backend/apps/inventory/serializers/labels.py)
- [frontend/src/components/shared/printTemplates.ts](../frontend/src/components/shared/printTemplates.ts)
- [frontend/src/components/shared/PrintResultSnackbar.tsx](../frontend/src/components/shared/PrintResultSnackbar.tsx)
- [backend/tests/test_labels.py](../backend/tests/test_labels.py)

#### Check your understanding

1. 12 mm tape is loaded, and the only registered container template is for 24 mm. What does the user see, and which line produces it?
2. Why does the registry store a media width at all?
3. Why does an update delete every `LabelTemplateField` and recreate them?
4. Printing several new location labels stops at the third. What does the message say, and why print one at a time?
5. Who may read templates, and who may change them?

<details><summary>Answers</summary>

1. "No container label template is registered for the currently loaded 12mm media…", thrown at [printTemplates.ts:19-24](../frontend/src/components/shared/printTemplates.ts#L19-L24) and shown by `PrintResultSnackbar` after the "failed to print:" prefix.
2. So the app can choose the template that fits the tape in the printer without asking the user. The printer reports the loaded width in its status.
3. A template has at most two field rows and they are edited together in one form, so a full replace is the simplest correct approach. Diffing would add code for no gain.
4. It appends "(2 of N printed before the failure)". Sequential printing stops at the first failure, so running out of tape does not queue a pile of failed jobs ([printTemplates.ts:61-77](../frontend/src/components/shared/printTemplates.ts#L61-L77)).
5. Any authenticated user may read, because the print flow needs the lookup. Create, update and delete need Lab Manager ([views/labels.py:25-28](../backend/apps/inventory/views/labels.py#L25-L28)).

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| The barcode carries the zero-padded label, which the action endpoints cannot look up (finding 3). | Verified (tested) | High |
| The padding width follows the highest container id. When the id passes 9,999, every on-screen label gains a digit and no longer matches the labels already printed. | Verified (read): [models/containers.py:52-56](../backend/apps/inventory/models/containers.py#L52-L56) | Low now |
| `Container.label` runs a `MAX(pk)` query every time it is read, once per row in a list. | Verified (measured as part of finding 5) | Medium |
| Template lookup happens in the browser. A second client (a phone app, a script) would have to reimplement it. | Worth a look | Low |

#### Compared with professional practice

**Matches common practice**
- Moving hardcoded configuration into a table with database constraints. `UniqueConstraint` is the right tool, and the tests cover both constraints.
- Explicit nested-write `create` and `update` on the serializer. The DRF documentation describes exactly this pattern for writable nested serializers.
- Tests for permissions by role ([test_labels.py](../backend/tests/test_labels.py)).

**Differs, and that is fine here**
- Orchestrating the print in the browser. The bridge is only reachable from the browser's side in the original design, so the browser has to coordinate. On the Pi, Django could call the bridge directly, but that would break the laptop setup.
- `sessionStorage` to carry a message across navigation. A larger app would use a global toast provider. This is smaller and works.

**Differs, and worth changing**
- A display string (`label`) is being used as an identifier in barcodes. Identifiers should have one canonical form. Encode the numeric id or the slug in the barcode and keep padding for display only.

#### Commits

11 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `54492d1` | 2026-08-19 | Added a print button to the Location edit button group |  |
| `3ca1a66` | 2026-08-24 | Added a print handler for location label printing |  |
| `87d0dbf` | 2026-09-14 | feat(frontend): add printer status indicator to the nav bar |  |
| `d74833e` | 2026-09-14 | feat(frontend): show print success/failure feedback everywhere printing happens |  |
| `1b622a5` | 2026-09-14 | feat(frontend): add a print-label button to the container table and detail view |  |
| `ef722e0` | 2026-09-14 | fix(frontend): verify printer status after printing, since print_label() can't detect errors itself |  |
| `b16bf89` | 2026-09-14 | feat(backend): add the label template registry (LabelTemplate/LabelTemplateField) |  |
| `15de543` | 2026-09-14 | feat(frontend): add the label template management UI |  |
| `1595652` | 2026-09-14 | feat(frontend): resolve print templates from the registry instead of hardcoding them |  |
| `c48a6eb` | 2026-09-30 | feat(locations): path on labels, auto-print, batch add, transfer warning fix *(also batch location add (5.13) and a transfer warning fix (5.9))* | yes |
| `ed057e5` | 2026-09-30 | feat(labels): print the full location path | yes |

---

### 5.4 Scanning and container actions

#### What changed

The Bluetooth scanner now drives four flows: check-out, check-in with weighing, transferring containers to a location, and moving locations under a new parent. Locations gained `LOC-<id>` barcodes. Check-in and weigh-in were merged into one atomic request.

#### How it works

The scanner is a keyboard. It types the barcode's content, `{"id":"CHEM-1161"}`, then presses Enter.

1. **Capturing a scan.** Every scannable input is a [ScannableFieldRow.tsx](../frontend/src/components/shared/ScannableFieldRow.tsx).
   - While the value contains `{`, the text is made transparent with CSS so the raw JSON is not visible as it arrives ([line 77](../frontend/src/components/shared/ScannableFieldRow.tsx#L77)).
   - On each change it runs [parseBarcode.ts](../frontend/src/components/shared/parseBarcode.ts). Once the JSON is complete and parses, the id is handed to the page's `onScan`.
   - A ref shared by all rows records "a scan just finished", and the next Enter keypress is swallowed so the scanner's trailing Enter does not submit the form ([lines 97-112](../frontend/src/components/shared/ScannableFieldRow.tsx#L97-L112)).
2. **Check-out** ([Checkout.tsx](../frontend/src/components/inventory/Checkout.tsx)). A scan fills the row and appends a new one. Submit opens a confirmation dialog, then posts a list of slugs to `check_out` ([views/containers.py:126-142](../backend/apps/inventory/views/containers.py#L126-L142)), which creates one `CheckoutEvent` per container.
3. **Check-in** ([WeighIn.tsx](../frontend/src/components/inventory/WeighIn.tsx)). A scan fills the id, reads the scale, fills the weight and appends a row. If the server says the container has no real tare weight, a third field appears for it. Submit posts to `weigh_in_bulk` ([views/containers.py:389-465](../backend/apps/inventory/views/containers.py#L389-L465)), which in one transaction records the readings, creates the check-in events, links each to its open check-out, and backfills tare weights.
4. **Transfer** ([Transfer.tsx](../frontend/src/components/inventory/locations/Transfer.tsx)). Scan containers, then scan a location label. A `LOC-` id sets the destination and submits ([lines 220-245](../frontend/src/components/inventory/locations/Transfer.tsx#L220-L245)). The server validates every container before saving any ([views/containers.py:325-383](../backend/apps/inventory/views/containers.py#L325-L383)), because the storage-conflict check (5.9) may need to stop the whole batch.
5. **Move** ([Move.tsx](../frontend/src/components/inventory/locations/Move.tsx)). Scan the locations to move, then scan the new parent twice in a row; the double scan marks it as the parent and submits. The server checks that the parent is not inside any location being moved, then re-parents them in a transaction ([views/locations.py:136-201](../backend/apps/inventory/views/locations.py#L136-L201)).
6. **Cycle protection.** `Location.clean()` walks up the parent chain and `save()` always calls `full_clean()` ([models/locations.py:33-42](../backend/apps/inventory/models/locations.py#L33-L42)).

#### Key files

- [frontend/src/components/shared/ScannableFieldRow.tsx](../frontend/src/components/shared/ScannableFieldRow.tsx), [parseBarcode.ts](../frontend/src/components/shared/parseBarcode.ts)
- [frontend/src/components/inventory/ContainerActions.tsx](../frontend/src/components/inventory/ContainerActions.tsx): the tabbed page holding all four
- [backend/apps/inventory/views/containers.py](../backend/apps/inventory/views/containers.py), [views/locations.py](../backend/apps/inventory/views/locations.py)
- [backend/tests/test_inventory_views.py](../backend/tests/test_inventory_views.py): `TestContainerTransfer`, `TestLocationMove`, `TestWeighInBulk`

#### Check your understanding

1. The scanner types `{"id":"CHEM-1161"}` and Enter. Name the code that hides the JSON, the code that extracts the id, and the code that stops Enter submitting the form.
2. Why is `justScannedRef` one ref shared by all rows and not one per row?
3. In `transfer`, why are all containers validated before any is saved, when the method is already wrapped in `@transaction.atomic`?
4. The server receives `chem-0292` for container 292. What happens, in each of check-out, transfer and check-in?
5. How does a check-in event know which check-out it closes?

<details><summary>Answers</summary>

1. The `midScan` style in `ScannableFieldRow`; `parseBarcode`; the `onKeyDown` handler that checks `justScannedRef`.
2. A completed scan appends a new row, and that row's `autoFocus` takes focus before the scanner's Enter arrives. The Enter lands on a different row from the one scanned into, so both must see the same flag.
3. `atomic` only rolls back when an exception escapes. A storage warning is returned as a normal 409 response, which commits whatever was saved so far. Validating first means nothing is saved until the whole batch is clear.
4. All three answer 400. `check_out` does an exact `get(slug=…)` and returns an empty 400. `transfer` and `weigh_in_bulk` lowercase the input and return "Container(s) not found: chem-0292". None of them strips the padding. This is finding 3.
5. The view finds the container's most recent "out" event and, if no "in" event already points at it, stores it as `related_event` ([views/containers.py:428-440](../backend/apps/inventory/views/containers.py#L428-L440)).

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| **Padded ids are not found (finding 3).** `Checkout.tsx` even strips the zeros for its validity check ([lines 194-197](../frontend/src/components/inventory/Checkout.tsx#L194-L197)) and then submits the unstripped value ([lines 88-90](../frontend/src/components/inventory/Checkout.tsx#L88-L90)). | Verified (tested) | High |
| `check_in` returns HTTP 200 with the body `400` for an unknown slug, because the status code was passed as the response data. The frontend no longer calls this endpoint. | Verified (tested): [views/containers.py:173](../backend/apps/inventory/views/containers.py#L173) | Low |
| Dead code: the `check_in` and `is_valid` actions, and `checkInContainers` and `checkValidId` in [api/inventory.ts](../frontend/src/api/inventory.ts), have no callers. | Verified (read) | Low |
| `check_out` is not atomic and matches slugs case-sensitively, unlike `transfer` and `weigh_in_bulk`. The same "find the open check-out" block is copied into two methods. | Verified (read): [views/containers.py:126-179](../backend/apps/inventory/views/containers.py#L126-L179), [lines 428-433](../backend/apps/inventory/views/containers.py#L428-L433) | Low |
| `transfer`, `weigh_in_bulk` and `move` index straight into `request.data`. A missing key is a `KeyError` and a 500. | Verified (read) | Medium |
| `Move.tsx` renders its rows without a `key` ([lines 162-163](../frontend/src/components/inventory/locations/Move.tsx#L162-L163)). React falls back to the index, so removing a middle row can show the wrong value in the wrong row. The other three forms use `key={field.id}`. | Verified (read) | Low |
| `Location.barcode` is not unique in the database, but `move` uses `.get()` on it. | Verified (read): [models/locations.py:21](../backend/apps/inventory/models/locations.py#L21) | Low |
| After a transfer only the container list is invalidated, so the Locations page can show the old contents for up to five minutes. | Verified (read): [Transfer.tsx:90](../frontend/src/components/inventory/locations/Transfer.tsx#L90) | Low |

#### Compared with professional practice

**Matches common practice**
- Bulk operations in one transaction with an all-or-nothing result, and tests that assert nothing moved on failure.
- A confirmation step before a batch write that is awkward to undo.
- A single reusable scan component in place of four copies.

**Differs, and that is fine here**
- Treating the scanner as a keyboard and detecting scans by content. Dedicated scanning apps use a prefix/suffix key or a serial mode; for a web form with an HID scanner, content detection is the practical approach.
- "Scan the parent twice" as a gesture. Unusual, but it keeps hands off the keyboard and is documented in the form's subheader.

**Differs, and worth changing**
- **Validate request bodies with serializers.** The DRF convention is a small `Serializer` per action (`TransferSerializer` with `containers` and `location`), so malformed input is a 400 with field errors. The hand-indexing here is the biggest stylistic gap between this code and a professional DRF codebase. About half a day for all the custom actions.
- **Normalise identifiers in one place.** One backend helper that turns any scanned form (`CHEM-0292`, `chem-292`, `292`) into a container, used by every action.
- **Delete dead endpoints.** Unused code that returns wrong status codes is a liability.
- Add the `react/jsx-key` lint rule. [eslint.config.js](../frontend/eslint.config.js) has no React plugin, which is why the missing key was not flagged.

#### Commits

14 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `0fa98ea` | 2026-07-08 | feat: added barocode scanning support for container actions |  |
| `4c96631` | 2026-07-13 | feat: add container transfer functionality and UI component |  |
| `9568439` | 2026-07-15 | feat: consolidate check-in and weigh-in, extract shared scan/weight field components |  |
| `92f10c9` | 2026-07-15 | Removed some testing code. |  |
| `9ac4d59` | 2026-07-16 | fix: prevent submission with empty checkin and containers fields; make WeightField required conditionally |  |
| `2fc121c` | 2026-07-17 | fix: ensure location field is required in Transfer component |  |
| `17f741a` | 2026-08-25 | Added Location barcode detection and auto submission to Transfer component |  |
| `02a490b` | 2026-08-25 | Added a check to prevent locations from have themselves as a parent/descendent. |  |
| `714a3a7` | 2026-08-25 | Add Move component and update ContainerActions for location management |  |
| `5f2e5e1` | 2026-08-25 | Implement bulk location move functionality with validation checks |  |
| `f1432d8` | 2026-08-25 | Backfill Location.barcode with LOC-<id> format and update Location creation to assign barcode |  |
| `fea49b5` | 2026-09-01 | Updated actions sub menu to include new move location action |  |
| `194e1d7` | 2026-09-02 | Refactor childLocations mapping to improve readability |  |
| `920b671` | 2026-09-29 | fix: update location id printing and scanning so container move workflow should work as intended. |  |

---

### 5.5 Weights, tare and computed container fields

#### What changed

Containers gained a real tare weight field, a way to backfill it during check-in, and a single definition of "percent remaining". Two bugs in that number were fixed: placeholder zero tare weights from the Notion import, and a dashboard query that used a different formula.

#### How it works

1. **The formula** lives in one place, `Container.percent_remaining` ([models/containers.py:102-124](../backend/apps/inventory/models/containers.py#L102-L124)):

   `(latest reading − tare weight) ÷ initial content mass × 100`

   It returns `None` when there is no reading, no positive tare weight, or no content mass.
2. **Initial content mass** ([lines 62-66](../backend/apps/inventory/models/containers.py#L62-L66)) is the quantity for mass units, or quantity × density for volume units.
3. **`has_estimated_usage`** ([lines 72-79](../backend/apps/inventory/models/containers.py#L72-L79)) is true only for a tare weight above zero. Migration [0026](../backend/apps/inventory/migrations/0026_null_placeholder_zero_tare_weights.py) nulled the zeros that Notion's formula field had produced for rows with no initial weight.
4. **Backfill at check-in.** `is_discarded` reports `has_estimated_usage` alongside the discard check, so `WeighIn.tsx` knows whether to show a tare field without a second request. `weigh_in_bulk` only writes a tare weight when the container does not already have a real one ([views/containers.py:442-448](../backend/apps/inventory/views/containers.py#L442-L448)).
5. **Dashboard** ([views/dashboard.py:38-44](../backend/apps/inventory/views/dashboard.py#L38-L44)). "Restock soon" narrows to containers with a reading and a positive tare, evaluates the Python property on each, and keeps the five lowest at or below 10 %.
6. **On creation** the container form computes tare as initial weight minus content mass and refuses a tare weight that does not equal that ([ContainerForm.tsx:200-243](../frontend/src/components/inventory/ContainerForm.tsx#L200-L243), [lines 535-563](../frontend/src/components/inventory/ContainerForm.tsx#L535-L563)). The view also records the initial weight as the first `WeightReading`.

#### Key files

- [backend/apps/inventory/models/containers.py](../backend/apps/inventory/models/containers.py)
- [backend/apps/inventory/views/dashboard.py](../backend/apps/inventory/views/dashboard.py)
- [backend/tests/test_dashboard.py](../backend/tests/test_dashboard.py), [test_inventory_models.py](../backend/tests/test_inventory_models.py)

#### Check your understanding

1. A 500 mL bottle, density 0.79, weighs 520 g full and 322.5 g now. What is its tare weight and its percent remaining?
2. Why did migration 0026 treat a tare weight of 0 as missing?
3. Why is "restock soon" computed in Python and not as one SQL query?
4. What stops the check-in backfill overwriting a tare weight that is already real?
5. A container is entered as `2 L` with density 1.0. What does `initial_content_mass` return, and what is wrong with it?

<details><summary>Answers</summary>

1. Content mass is 500 × 0.79 = 395 g, so tare is 520 − 395 = 125 g. Remaining is (322.5 − 125) ÷ 395 = 50 %.
2. No empty container weighs nothing. The zeros were Notion's default for a formula with a missing input, and they made 52 containers show meaningless percentages.
3. The content-mass rule branches on the unit and density, and the latest reading is a separate table. The earlier SQL version divided by the whole initial weight and silently disagreed with the property. One definition in Python was chosen over two that can drift.
4. `weigh_in_bulk` checks `not container.has_estimated_usage` before applying it.
5. It returns 2 × 1.0 = 2, treating litres as if they were millilitres. Readings are in grams, so the percentage would be wildly wrong. The same applies to `kg` and `mg`. This is finding 15.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| **Unit prefixes are ignored** in `initial_content_mass` (finding 15). The frontend converts for its own tare calculation, the backend does not. Live data has 820 containers in `g`, 288 in `mL` and none in other units. | Verified (read and measured) | Low now, High the day someone picks `L` |
| `initial_content_mass` and `container_weight` raise if density is set but the unit or quantity is missing. No live row has that combination. | Verified (read and measured): [models/containers.py:62-70](../backend/apps/inventory/models/containers.py#L62-L70) | Low |
| **The weight history can be edited** (finding 10). `WeightReadingView` is a full `ModelViewSet`, and `recorded_at` uses `auto_now=True`, which updates on every save. `CheckoutEvent.timestamp` has the same setting. | Verified (tested) | Medium |
| `WeightReading` has no `source` field, although CLAUDE.md says it distinguishes manual from balance readings. A typed weight and a measured one are indistinguishable. | Verified (read) | Low |
| `DashboardView` is a `ModelViewSet` (finding 2). Only `list` was meant to exist. | Verified (tested) | High |
| "Restock soon" runs one query per candidate container. About 450 containers have a real tare weight today. | Verified (measured) | Low |
| The form requires the tare weight to equal the computed difference exactly, so a tare weight measured on an empty bottle cannot be entered at creation. | Worth a look: [ContainerForm.tsx:535-563](../frontend/src/components/inventory/ContainerForm.tsx#L535-L563) | Low |

#### Compared with professional practice

**Matches common practice**
- Deriving usage from readings instead of storing a mutable number, as the project plan set out.
- One source of truth for a business formula, with a regression test for the bug that prompted it ([test_dashboard.py](../backend/tests/test_dashboard.py)).
- Fixing bad imported data with a data migration, with the reasoning in the migration file.
- `Decimal` arithmetic for weights.

**Differs, and that is fine here**
- Computing the dashboard list in Python. With about a thousand rows it is fast enough; a larger system would precompute or annotate.

**Differs, and worth changing**
- **Make append-only real.** Use `auto_now_add=True`, and build the views from `CreateModelMixin` and `ListModelMixin` only. Your own `SDSView` already does this correctly; copy it. About an hour including the migration.
- **Normalise units at the boundary.** Store quantities in base units, or convert inside `initial_content_mass`. Unit handling split between frontend and backend is a classic source of silent errors.
- **Use the narrowest view class.** `DashboardView` should be an `APIView` or a `ViewSet` with only `list`. DRF's guidance is to expose only the actions you intend.

#### Commits

6 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `07c5c43` | 2026-09-01 | Fix placeholder tare_weight=0 corrupting percent_remaining; resolve WeighIn TODO |  |
| `2fb1286` | 2026-09-01 | Build the WeighIn dynamic tare-weight backfill field after all |  |
| `c85c73f` | 2026-09-01 | Fix Check In row layout cramping with the tare-weight field |  |
| `f217d5d` | 2026-09-15 | Fix restock_soon computing the wrong percent-remaining formula | yes |
| `0bf6c18` | 2026-09-21 | feat: add tare weight field to container model and update related components |  |
| `cbed182` | 2026-09-23 | fix: show blank container quantity instead of "None None" *(backend display fix on `Container.quantity`)* | yes |

---

### 5.6 SDS and Google Drive

#### What changed

Safety data sheets are now uploaded from the app, stored in a Google shared drive, and viewable by anyone without logging in. An SDS belongs to a container, not a chemical. The upload dialog suggests documents already on file and warns about duplicates.

#### How it works

1. **Storage.** The database row ([models/containers.py:189-215](../backend/apps/inventory/models/containers.py#L189-L215)) holds a `drive_id`, a generated file name, revision date and number, and a list of GHS pictograms. The PDF itself is in Drive.
2. **Credentials.** [drive.py](../backend/apps/inventory/drive.py) authenticates as a **service account**: a Google identity for a program, with a JSON key file on the server. A service account has no storage of its own, so the folder must be in a shared drive that the account has been added to.
3. **Upload** ([serializers/chemicals.py:102-169](../backend/apps/inventory/serializers/chemicals.py#L102-L169)). The write serializer takes exactly one of `file` or `existing_sds`.
   - With a file: build the name `Manufacturer_ProductNum_Chemical_RevN_Date.pdf`, upload it, grant "anyone with the link can view", and save the returned id.
   - With an existing SDS: create a new row that points at the same Drive file. One PDF can serve many containers.
4. **Reading.** [views/sds.py](../backend/apps/inventory/views/sds.py) allows list and retrieve to anyone (`AllowAny`) and create to Stockroom and up. There is no update or delete. The serializer adds a `view_url` for Drive's preview page, which [SdsViewer.tsx](../frontend/src/components/sds/SdsViewer.tsx) embeds.
5. **Search.** `SDSFilter.filter_search` ([filters.py:95-105](../backend/apps/inventory/filters.py#L95-L105)) matches chemical name, product name, CAS, product number, or a container id with or without `CHEM-`.
6. **The dialog** ([SdsUploadDialog.tsx](../frontend/src/components/sds/SdsUploadDialog.tsx)) has two modes. *Immediate*: the container exists, so submit attaches now. *Deferred*: on the new-container form no container exists yet, so the dialog hands the selection back and the form calls `createSds` after the container is created. Before uploading a new file it checks for an SDS with the same chemical, revision date and revision number, and offers to attach that one.
7. **Fallback.** A container with no SDS of its own shows its chemical's other SDS ([useContainerSdsFallback.ts](../frontend/src/hooks/useContainerSdsFallback.ts)).

#### Key files

- [backend/apps/inventory/drive.py](../backend/apps/inventory/drive.py)
- [backend/apps/inventory/serializers/chemicals.py](../backend/apps/inventory/serializers/chemicals.py)
- [backend/apps/inventory/views/sds.py](../backend/apps/inventory/views/sds.py)
- [frontend/src/components/sds/](../frontend/src/components/sds/)
- [backend/tests/test_sds.py](../backend/tests/test_sds.py)

#### Check your understanding

1. Where is the PDF stored, and what does the database keep?
2. Why is an SDS attached to a container and not to a chemical?
3. What are the two modes of `SdsUploadDialog`, and why is the second needed?
4. How can two SDS rows refer to one file, and why would you want that?
5. What two separate things make an SDS readable without logging in?
6. Why does `SDSView` leave the default authentication classes in place when list and retrieve are public?

<details><summary>Answers</summary>

1. In a Google shared drive. The row keeps the Drive file id, the generated name, revision details and pictograms.
2. The same chemical from two manufacturers has two different SDS documents. The chemical's list is built by aggregating across its containers.
3. Immediate and deferred. On the new-container form there is no container id to attach to until the form is submitted.
4. The `existing_sds` path copies `drive_id` and `file_name` into a new row. It avoids uploading the same PDF once per bottle.
5. `AllowAny` on the API's list and retrieve, and the "anyone with the link" permission set on the Drive file.
6. `create` needs to know who is logged in to check their role. Removing the authenticators would make every request anonymous, including create.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| "Latest SDS" orders by `-revision_number`, a text column, so `"10"` sorts below `"9"`. Only one live container has more than one SDS. | Verified (read and measured): [serializers/containers.py:62-65](../backend/apps/inventory/serializers/containers.py#L62-L65) | Low |
| A PDF is recognised by its file extension only. A stockroom user could publish any file renamed to `.pdf` on a public link. | Verified (read): [serializers/chemicals.py:126-131](../backend/apps/inventory/serializers/chemicals.py#L126-L131) | Low |
| The Drive upload and the database insert are not one unit. If the insert fails after the upload, the file is orphaned in Drive. | Verified (read): [serializers/chemicals.py:141-169](../backend/apps/inventory/serializers/chemicals.py#L141-L169) | Low |
| The service account uses the full `drive` scope. | Verified (read): [drive.py:19](../backend/apps/inventory/drive.py#L19) | Low |
| The whole upload is read into memory and sent to Google during the request. With the 25 MB limit and three workers this is acceptable. | Verified (read): [drive.py:47](../backend/apps/inventory/drive.py#L47) | Low |
| The public list exposes container ids and product names. This was a deliberate decision and is commented. | Verified (read) | Informational |
| `c606d70` is a single 2,000-line commit across 39 files. It is the hardest commit in the project to review. | Verified (measured) | Process |

#### Compared with professional practice

**Matches common practice**
- Files in object storage with a pointer in the database.
- A custom exception (`DriveUploadError`) at the integration boundary, translated to a validation error for the API.
- Tests that mock the external service and cover both create paths and the permissions.
- Composing a view from mixins to offer exactly list, retrieve and create.

**Differs, and that is fine here**
- Google Drive as file storage. A company would use S3 or similar with signed URLs. Drive is free for the university, already has the sharing model you want, and staff can browse the folder directly.
- Public-by-link files. SDS documents are public safety information, so this is a reasonable choice and it is documented.

**Differs, and worth changing**
- Check the file's first bytes (`%PDF-`) as well as its name. Five lines.
- Sort revisions by date, then by row id, and stop relying on text ordering of the revision number.
- Break large features into several commits or pull requests. A reviewer cannot reasonably review 2,000 lines at once, and neither can you later.

#### Commits

11 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `c606d70` | 2026-09-08 | Implement SDS (Safety Data Sheet) feature: Google Drive-backed upload/view | yes |
| `39c733c` | 2026-09-08 | Fix SDS uploads: support shared-drive folders, fix broken auth on create | yes |
| `2df7998` | 2026-09-08 | Generate descriptive SDS filenames; scope/improve attach-existing suggestions | yes |
| `8242b3f` | 2026-09-08 | Dedupe SDS attach-existing suggestions by drive_id | yes |
| `3aebb52` | 2026-09-08 | Dedupe ContainerDetail's SDS fallback list; fix its dark-mode link styling | yes |
| `f0e63c5` | 2026-09-08 | Support attaching an existing SDS from the Add Container form | yes |
| `85924a0` | 2026-09-08 | Wire in real GHS pictogram images | yes |
| `57769c6` | 2026-09-08 | Make product # a refiner (not required) for SDS suggestions; add a pre-submit duplicate-revision check | yes |
| `99296ea` | 2026-09-08 | Fix GHS pictograms disappearing in dark mode | yes |
| `f863e73` | 2026-09-08 | Include product name in SDS search | yes |
| `d01cd0f` | 2026-09-14 | Store SDS revision # as text; add the Notion reconciliation script *(also the Notion reconciliation script (5.11))* | yes |

---

### 5.7 Users, roles and permissions

#### What changed

Six roles in four ranks, a permission-class factory used by every view, a profile page, a user management page for lab managers, and role-based hiding of pages and buttons in the frontend.

#### How it works

1. **Roles and ranks.** `User.Role` has six values ([users/models.py:13-24](../backend/apps/users/models.py#L13-L24)). [permissions.py:9-16](../backend/apps/users/permissions.py#L9-L16) ranks them: Admin and Lab Manager 4, Coordinator and Faculty 3, Stockroom 2, Lab Assistant 1.
2. **The check.** `role_at_least(minimum)` returns a new permission class whose `has_permission` compares the user's rank with the minimum ([permissions.py:19-33](../backend/apps/users/permissions.py#L19-L33)). It is a factory because DRF instantiates permission classes with no arguments.
3. **Per-action rules.** Each viewset overrides `get_permissions()` and switches on `self.action`. For containers: reads need any login, writes need Stockroom, delete needs Lab Manager ([views/containers.py:59-78](../backend/apps/inventory/views/containers.py#L59-L78)).
4. **Two user serializers.** `UserSerializer` (self-service, `role` read-only) and `UserAdminSerializer` (role writable). Which one a view uses decides whether it can promote someone ([users/serializers.py:19-66](../backend/apps/users/serializers.py#L19-L66)).
5. **Email rule.** Registration and every later edit require an `@lipscomb.edu` or `@mail.lipscomb.edu` address ([users/serializers.py:6-16](../backend/apps/users/serializers.py#L6-L16)).
6. **Frontend.** [roles.ts](../frontend/src/components/shared/roles.ts) copies the rank table. `RequireRole` redirects from pages the user cannot use ([App.tsx:87-92](../frontend/src/App.tsx#L87-L92)), and components hide buttons with `hasRoleAtLeast`. This is for usability only. The server is what enforces.

#### Key files

- [backend/apps/users/permissions.py](../backend/apps/users/permissions.py), [views.py](../backend/apps/users/views.py), [serializers.py](../backend/apps/users/serializers.py)
- [frontend/src/components/shared/roles.ts](../frontend/src/components/shared/roles.ts), [frontend/src/components/accounts/](../frontend/src/components/accounts/)
- [backend/tests/test_users.py](../backend/tests/test_users.py), `TestRolePermissions` in [test_inventory_views.py](../backend/tests/test_inventory_views.py)

#### Check your understanding

1. What role does a newly registered account get, and which line decides it?
2. Why is `role_at_least` a function that returns a class?
3. A Lab Assistant edits the page's JavaScript to show the Delete button and clicks it. What stops the delete?
4. Why are there two user serializers instead of one with a flag?
5. Which actions on a location need a role, and which do not?

<details><summary>Answers</summary>

1. Lab Manager, set at [users/views.py:134](../backend/apps/users/views.py#L134). The model's default is Lab Assistant, but the view overrides it. The line above is a `TODO`.
2. DRF calls each permission class with no arguments. The factory closes over the minimum role so the class DRF instantiates already knows it.
3. The server's `get_permissions()` returns `role_at_least(LAB_MANAGER)` for `destroy` and answers 403. Frontend checks are cosmetic.
4. So that "can this request change a role" is decided by which serializer the view uses, not by a runtime condition that a bug could flip.
5. `create`, `add_child`, `move` and `destroy` need Stockroom. `update` and `partial_update` are missing from the set, so any logged-in user can rename or re-parent a location. This is finding 8.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| **Open registration as Lab Manager (finding 1).** The existing test `test_creates_a_user_that_actually_passes_role_at_least_lab_manager` asserts this behaviour, because it was written to fix a different bug. The fix is to delete the `role=` argument and let the model default apply, then promote real staff by hand. | Verified (tested): [users/views.py:130-134](../backend/apps/users/views.py#L130-L134), [test_users.py:44-61](../backend/tests/test_users.py#L44-L61) | **High** |
| Registration never verifies that the email address belongs to the person. The domain check only tests the text. | Verified (read) | High with the above, Medium alone |
| Location `update` and `partial_update` are ungated (finding 8). | Verified (tested) | Medium |
| The dashboard route bypasses the container role rules (finding 2). | Verified (tested) | High |
| Login is not rate-limited, so passwords can be guessed without restriction. | Verified (read): [settings.py:144-149](../backend/config/settings.py#L144-L149) | Medium |
| `/api/auth/validate/` tells an anonymous caller whether a username or email exists. | Verified (read): [users/views.py:167-195](../backend/apps/users/views.py#L167-L195) | Low |
| There is no way to deactivate a user in the app, and nothing prevents the last Lab Manager demoting themselves. | Verified (read) | Low |
| The implemented roles do not match [Roles_and_Permissions.md](Roles_and_Permissions.md), which describes guests, elevation requests and a Coordinator with wider rights. | Verified (read) | Documentation |
| `preValidate` builds its query string without encoding, so an email containing `+` is checked as if it contained a space. | Verified (read): [api/auth.ts:43](../frontend/src/api/auth.ts#L43) | Low |

#### Compared with professional practice

**Matches common practice**
- Permission classes and per-action `get_permissions()`. This is the documented DRF approach.
- Deny by default: `IsAuthenticated` is the global default in settings.
- Server-side enforcement with the frontend only hiding what would be refused.
- Argon2 password hashing and Django's password validators.
- Separate read and write serializers to control which fields are writable.

**Differs, and that is fine here**
- Standalone accounts instead of university single sign-on. The project plan lists SSO as an open IT question.
- A hand-kept copy of the rank table in TypeScript. With six roles this is tolerable; larger systems send the user's capabilities from the server.
- A linear rank instead of per-permission grants. Simple, and it fits how the lab is organised.

**Differs, and worth changing**
- **Least privilege at registration.** OWASP's access control guidance is that new accounts get the minimum and are elevated explicitly. One line to fix.
- **Allow-list, don't block-list, the gated actions.** The location bug exists because the view lists the actions that need a role and forgot two. The safer pattern is "reads are open, everything else needs a role", so a new action is protected by default.
- **Rate-limit login.** DRF's `ScopedRateThrottle` on `LoginView`, as you already did for bug reports.
- **Test the negative cases for every role and every write action.** A parametrised test over (role, method, URL) would have caught findings 2 and 8.

#### Commits

5 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `287208a` | 2026-09-01 | Fix RegisterView storing the role/user_type display label instead of value |  |
| `e4b9e9d` | 2026-09-02 | Refactor user roles and permissions to enhance clarity and flexibility; implement role-based access control… |  |
| `a0ea177` | 2026-09-02 | Implement user profile management: add profile editing functionality, enforce Lipscomb email validation, an… |  |
| `a0b074c` | 2026-09-02 | Implement user management features: add user listing, detail view, and role-based access control; create us… |  |
| `823834d` | 2026-09-02 | Implement role-based access control for inventory components; restrict editing and actions to users with 's… |  |

---

### 5.8 Search, filters and query performance

#### What changed

List endpoints accept search, filter and ordering parameters through `django-filter`. Three location serializers were rewritten to use a fixed number of queries. The frontend gained debounced search boxes.

#### How it works

1. **Three filter backends** are on by default ([settings.py:137-141](../backend/config/settings.py#L137-L141)):
   - `DjangoFilterBackend` reads field parameters such as `?manufacturer=acme`, defined by a `FilterSet` class
   - `SearchFilter` reads `?search=` and matches the view's `search_fields`
   - `OrderingFilter` reads `?ordering=-date_received`, limited to `ordering_fields`
2. **FilterSets** are in [filters.py](../backend/apps/inventory/filters.py). Plain fields are generated from the model. Others use a method, for example `checkout_status`, which annotates each container with the action of its most recent event using a subquery and filters on that ([lines 52-56](../backend/apps/inventory/filters.py#L52-L56)). The subquery helper is shared with the dashboard so the two cannot drift.
3. **Location tree in one query.** `LocationSerializer.to_representation` loads every location once, builds a parent-to-children map, and recurses in memory, building each `full_path` from its parent's ([serializers/locations.py:29-72](../backend/apps/inventory/serializers/locations.py#L29-L72)). `LocationMenuSerializer` and `LocationContainersSerializer` use the same idea. Three tests assert that the query count does not grow with the tree.
4. **Frontend.** [Containers.tsx:162-175](../frontend/src/components/inventory/Containers.tsx#L162-L175) debounces the search input by 300 ms and passes it as a parameter. `toQueryString` drops empty values. The parameters are part of the query key, so each search is cached separately.

#### Key files

- [backend/apps/inventory/filters.py](../backend/apps/inventory/filters.py)
- [backend/apps/inventory/serializers/locations.py](../backend/apps/inventory/serializers/locations.py)
- [frontend/src/api/client.ts](../frontend/src/api/client.ts) (`toQueryString`), [queryKeys.ts](../frontend/src/api/queryKeys.ts)
- `TestContainerFilters`, `TestLocationTreeSerialization`, `TestLocationMenu` in [test_inventory_views.py](../backend/tests/test_inventory_views.py)

#### Check your understanding

1. `GET /api/inventory/containers/?search=acetone&ordering=-date_received&is_opened=true`. Which backend handles each parameter?
2. How does `?checkout_status=out` find checked-out containers when there is no such column?
3. What was the N+1 problem in the location tree, and how does the new serializer avoid it?
4. Why does `containerKeys.list()` use `{}` when no parameters are given?
5. How many queries does the container list run today, and where do they come from?

<details><summary>Answers</summary>

1. `SearchFilter`, `OrderingFilter` and `DjangoFilterBackend` (through `ContainerFilter.filter_is_opened`).
2. It annotates each container with a subquery returning the `action` of its newest `CheckoutEvent`, then filters where that equals `out`.
3. The old serializer queried children, type and the ancestor chain for every node. The new one loads all locations once and walks an in-memory map.
4. TanStack Query matches keys by prefix, and an empty object matches any object. So invalidating `containerKeys.list()` also invalidates every parameterised list.
5. 7,243 for 1,131 containers. Per row: `label` runs `MAX(pk)`, `latest_reading` fetches the newest reading, `percent_remaining` fetches it again, `checkout_status` fetches the newest event and its user, and `latest_sds` fetches the newest SDS. This is finding 5.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| **The container list is the slow path (finding 5).** 321 queries per 50 containers, 22.6 s for the full list in a Django shell on the Pi. The location work in this category fixed the same pattern elsewhere but not here. | Verified (measured) | High |
| The chemical list has the same shape: 233 queries per 50 chemicals, from `get_sds` and nested ingredients. | Verified (measured): [serializers/chemicals.py:51-57](../backend/apps/inventory/serializers/chemicals.py#L51-L57) | Medium |
| No pagination anywhere. Every list returns every row, and ag-grid pages in the browser. | Verified (read): [settings.py:130-150](../backend/config/settings.py#L130-L150) | Medium |
| "Restock soon" in the Containers page is filtered in the browser after fetching the full list. | Verified (read): [Containers.tsx:59-74](../frontend/src/components/inventory/Containers.tsx#L59-L74) | Low |
| `ChemicalStorageCategoryView.get_queryset` returns a Python list, so its detail routes always answer 404. The frontend only uses the list. | Verified (tested): [views/chemicals.py:81-85](../backend/apps/inventory/views/chemicals.py#L81-L85) | Low |

#### Compared with professional practice

**Matches common practice**
- `django-filter` with `FilterSet` classes. This is the standard DRF filtering stack.
- Query-count regression tests with `CaptureQueriesContext`. Many professional codebases do not have these, and they are valuable.
- Debounced search input and parameters in the cache key.
- Restricting `ordering_fields` so callers cannot sort by arbitrary columns.

**Differs, and that is fine here**
- Loading every location to build the tree. With 70 locations this is the simplest correct approach; `django-mptt` or a recursive CTE would be the choice at thousands.
- Client-side pagination. Fine at a thousand rows if the server builds the list efficiently.

**Differs, and worth changing**
- **Fix the container list.** The standard tools are `select_related` and `prefetch_related` for relations, `Subquery` or `Prefetch` with `to_attr` for "latest related row", and computing the label padding once per request. Expect a drop from about 7,000 queries to under ten. About a day, with a query-count test like the ones you already have.
- **Turn on pagination**, or decide deliberately that lists are capped. DRF's `PageNumberPagination` is one setting; the frontend change is larger because ag-grid currently receives everything.
- **Measure before optimising.** Add `django-debug-toolbar` or `django-silk` in development so the query count is visible while you work. That would have surfaced this the first time the page loaded slowly.

#### Commits

5 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `6a23e72` | 2026-09-02 | Add filters for Container, Chemical, and Location models with search and ordering capabilities |  |
| `6ee6bef` | 2026-09-02 | Add query string utility and enhance container fetching with search capabilities |  |
| `038fd90` | 2026-09-02 | Add search functionality to Chemicals component and update API calls |  |
| `9f6c7ec` | 2026-09-02 | Optimize location container retrieval and serialization to reduce query count and improve performance |  |
| `34399c7` | 2026-09-02 | Refactor filters and serializers for improved efficiency and clarity |  |

---

### 5.9 Storage categories and conflict warnings

#### What changed

The storage categories now follow the Flinn Scientific pattern with a searchable picker. When a container is created, edited or transferred into a location, the server checks four compatibility rules and asks for confirmation if any is broken.

#### How it works

1. **Data.** Migration [0032](../backend/apps/inventory/migrations/0032_flinn_storage_categories.py) loads the Flinn codes (O1 to O10, I1 to I11) with their descriptions and a `families` list, so typing "ketone" in the picker finds O4. The source table is [Flinn Scientific Chemical Storage Pattern.md](Flinn%20Scientific%20Chemical%20Storage%20Pattern.md).
2. **Rules.** `check_storage_conflicts(chemical, location)` in [storage_rules.py:52-165](../backend/apps/inventory/storage_rules.py#L52-L165) compares the chemical with everything else stored directly in that location:
   - organic with inorganic
   - flammable with oxidizing, using GHS pictograms from every SDS of each chemical
   - nitric acid with anything else
   - different categories within the same group
3. **Advisory, not blocking.** `ContainerWriteSerializer.validate` runs the check when the location changes and stores the result on the serializer ([serializers/containers.py:118-139](../backend/apps/inventory/serializers/containers.py#L118-L139)). It does not raise.
4. **The 409 handshake.** The view looks at `serializer.storage_warnings`. If there are any and the request does not include `confirm_storage_conflicts: true`, it returns 409 with the warnings and saves nothing ([views/containers.py:195-207](../backend/apps/inventory/views/containers.py#L195-L207)).
5. **Frontend.** [useStorageConflictConfirm.ts](../frontend/src/components/shared/useStorageConflictConfirm.ts) recognises that 409, shows the warnings in a dialog, and on "Store anyway" resends the same request with the flag.
6. **Batches.** `transfer` passes each container the other chemicals in the batch as `also_placing`, so two incompatible containers moved together into an empty location are still caught.

#### Key files

- [backend/apps/inventory/storage_rules.py](../backend/apps/inventory/storage_rules.py)
- [backend/tests/test_storage_rules.py](../backend/tests/test_storage_rules.py): 30 tests, the best-covered module in the project
- [frontend/src/components/shared/StorageCategorySelect.tsx](../frontend/src/components/shared/StorageCategorySelect.tsx)
- [frontend/src/components/shared/useStorageConflictConfirm.ts](../frontend/src/components/shared/useStorageConflictConfirm.ts)

#### Check your understanding

1. State the four rules.
2. Two shelves in the same cabinet each hold one container. Are they checked against each other?
3. How does the browser learn that a save needs confirmation, and how does it confirm?
4. Where does the server learn that a chemical is flammable?
5. What is `also_placing` for?

<details><summary>Answers</summary>

1. Organics and inorganics apart; flammables and oxidizers apart; nitric acid alone; only one storage category per location.
2. No. The check only looks at containers whose `location` is exactly the same row. Parents, children and siblings are ignored.
3. The server answers 409 with `{warnings, requires_confirmation}`. The hook shows them and, on confirm, resends the identical request with `confirm_storage_conflicts: true`.
4. From the GHS pictograms entered on SDS uploads, combined across every SDS of every container of that chemical.
5. It lists chemicals arriving in the same request that are not saved yet, so a batch is checked against itself as well as against what is already there.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| **A chemical with no storage category is never warned about.** Finding 9 means new mixtures and their new ingredients always lack one, and finding 4 means a new single chemical cannot be saved without one. | Verified (tested) | Medium |
| The flammable and oxidizer rule depends on someone ticking pictograms when uploading an SDS. A chemical with no SDS has no hazards as far as the rule knows. | Verified (read): [storage_rules.py:31-49](../backend/apps/inventory/storage_rules.py#L31-L49) | Medium |
| Only the immediate location is compared. Whether a "location" is a shelf or a whole cabinet decides what the rules can see. | Verified (read) | Design choice to be aware of |
| Nitric acid is recognised by one CAS number. Solutions entered as mixtures would not match. | Verified (read): [storage_rules.py:28](../backend/apps/inventory/storage_rules.py#L28) | Low |
| The check runs per container in a transfer, so a batch of *n* runs *n* location queries. | Verified (read) | Low |
| A user's decision to override a warning is not recorded anywhere. | Verified (read) | Low |

#### Compared with professional practice

**Matches common practice**
- Business rules in a plain module with no HTTP in it, tested directly. This is the cleanest code in the project to read.
- Seeding reference data with a migration that copies its data in, so later code changes cannot break it.
- 409 Conflict for "this would succeed but needs a decision".
- A thorough test file that covers each rule, both directions, and the edge cases.

**Differs, and that is fine here**
- A confirmation flag in the request body. Larger APIs would offer a separate dry-run endpoint or a `force` query parameter. The effect is the same.
- Rules in code. A regulated environment would want them configurable and versioned; four fixed rules do not need that.

**Differs, and worth changing**
- **Keep an audit trail of overrides.** Who stored what where, against which warning. In a safety context this is the first thing an inspector asks for. One small model and one `create` call.
- **Treat "unknown" as its own state.** Show "no storage category set" or "no SDS on file" in the confirmation, so a clean result is not mistaken for a safe one.

#### Commits

3 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `a180faf` | 2026-09-17 | feat: implement storage conflict warnings for container location changes |  |
| `8d974ad` | 2026-09-23 | feat: Flinn storage category picker with searchable families | yes |
| `77b6900` | 2026-09-23 | feat: warn when storing different storage categories together | yes |

---

### 5.10 Bug reports, feedback and diagnostics

#### What changed

A Help menu lets anyone report a problem or send feedback. The frontend keeps a rolling buffer of recent errors and attaches it to bug reports. Reports from logged-in users become issues on the public GitHub repository, with private details kept in the database.

#### How it works

1. **Capture.** [diagnostics/install.ts](../frontend/src/diagnostics/install.ts) runs before React renders. It wraps `console.error` and `console.warn`, and listens for uncaught errors and unhandled promise rejections. `apiFetch` and `bridgeFetch` record failed requests, and the Navbar records each navigation.
2. **Buffer.** [diagnostics/buffer.ts](../frontend/src/diagnostics/buffer.ts) keeps the last 100 entries. Every string is passed through [scrub.ts](../frontend/src/diagnostics/scrub.ts), which redacts session and CSRF tokens, passwords, bearer tokens and email addresses, then truncated. Repeated identical entries collapse into one with a count.
3. **Snapshot.** Opening the dialog calls `buildDiagnostics` ([snapshot.ts:66-77](../frontend/src/diagnostics/snapshot.ts#L66-L77)): the buffer, browser and screen details, the user's role, the app's git commit, the last printer status, and the crash if the dialog was opened from the error page. The snapshot is taken when the dialog opens, not when it is submitted ([FeedbackProvider.tsx:32-52](../frontend/src/components/feedback/FeedbackProvider.tsx#L32-L52)).
4. **Storing.** `POST /api/feedback/reports/` is open to anonymous users and throttled: 5 per hour anonymous, 30 per hour per user ([feedback/views.py:22-49](../backend/apps/feedback/views.py#L22-L49)). The serializer caps diagnostics at 256 KB.
5. **GitHub.** For a logged-in reporter the view saves the row as `pending`, then after the transaction commits calls `send_issue` ([feedback/views.py:75-84](../backend/apps/feedback/views.py#L75-L84)).
   - [issues.py](../backend/apps/feedback/issues.py) builds a public issue from what the user typed, the page path without its query string, the app version and the reporter's **role**. Never the name or the diagnostics.
   - [github.py](../backend/apps/feedback/github.py) authenticates as a **GitHub App**: it signs a short-lived JWT with the app's private key, exchanges it for an installation token valid for an hour, caches that, and creates the issue.
   - The outcome is written back to the row as `created` or `failed`.
6. **Anonymous reports and all feedback** stay in the database until a lab manager promotes them from Django admin or the `promote` action.
7. **Retry.** `manage.py retry_github_issues` resends failed rows and any stuck in `pending` for over ten minutes.

[Bug-Reporting-Plan.md](Bug-Reporting-Plan.md) has the design decisions and the GitHub App setup.

#### Key files

- [backend/apps/feedback/](../backend/apps/feedback/): `models.py`, `views.py`, `issues.py`, `github.py`, `admin.py`
- [frontend/src/diagnostics/](../frontend/src/diagnostics/)
- [frontend/src/components/feedback/](../frontend/src/components/feedback/)
- [backend/tests/test_feedback.py](../backend/tests/test_feedback.py)

#### Check your understanding

1. What does a public GitHub issue contain, and what stays private?
2. When is the diagnostics snapshot taken, and why then?
3. GitHub is down when a report is submitted. What does the user see, and what happens to the report?
4. Why are anonymous reports not sent to GitHub automatically?
5. Why is `send_issue` called inside `transaction.on_commit`?
6. How does the app know which version of the code a report came from?

<details><summary>Answers</summary>

1. Public: impact, page path, app version, reporter's role, summary and description. Private, in the database: console output, failed requests, navigation trail, system details, crash stack, and which user sent it.
2. When the dialog opens. That is the moment the user noticed the problem; whatever happens while they type is not evidence.
3. The user sees success with a reference number and no GitHub link. The row is saved with `github_status="failed"` and the error text, waiting for a retry.
4. The repository is public. An unauthenticated endpoint that writes to it would be a spam channel.
5. So an issue is never created for a row whose save was rolled back.
6. [vite.config.ts](../frontend/vite.config.ts) stamps the short git commit hash into the bundle as `__APP_VERSION__` at build time.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| **Nothing schedules the retry command.** [deploy/pi/](../deploy/pi/) has a timer for backups only. A failed send stays failed until someone runs the command or uses the admin action. | Verified (read) | Medium |
| The GitHub call happens inside the web request, with a ten-second timeout for the token and another for the issue. A slow GitHub makes the submit button hang. | Verified (read): [github.py:23](../backend/apps/feedback/github.py#L23) | Low |
| Throttle counters and the token cache use Django's default per-process memory cache. With three gunicorn workers the limits are effectively three times higher, and they reset on restart. | Verified (read) | Low |
| The anonymous throttle identifies callers by IP. Behind nginx this relies on `X-Forwarded-For`, which a client can set, because `NUM_PROXIES` is not configured. | Worth a look | Low |
| Scrubbing is pattern-based. A password in an unusual shape, or a student id, would pass through. The data only reaches Django admin. | Verified (read): [scrub.ts](../frontend/src/diagnostics/scrub.ts) | Low |
| The summary and description are user-typed and posted publicly as written. A user could paste personal information into a public issue. | Verified (read) | Low |

#### Compared with professional practice

**Matches common practice**
- A clear split between public and private data, enforced in one function and tested (`test_issue_body_omits_private_diagnostics`).
- GitHub App authentication instead of a personal access token. This is GitHub's recommended approach for integrations: short-lived tokens, scoped to one repository.
- Saving first and treating the external call as best-effort, with a status column and a retry path.
- Throttling an anonymous write endpoint and capping payload size on the server.
- Redacting before data enters the buffer, not on the way out.

**Differs, and that is fine here**
- Building this at all. A company would install Sentry or a similar service and get stack traces, grouping and alerting for free. Building it was a reasonable way to learn the pieces, and it sends nothing to a third party.
- A synchronous call to GitHub. Larger systems use a task queue (Celery, RQ). For a few reports a month, a queue is more to run than it is worth.

**Differs, and worth changing**
- **Schedule the retry.** A second systemd timer next to the backup one, about fifteen lines.
- **Use a shared cache** (Django's database cache needs no new service) so throttles and the token are shared between workers.
- **Tell someone when something breaks without a user reporting it.** Reports depend on a user choosing to send one. Server-side 500s are only in `journalctl`. See section 6 on logging.

#### Commits

3 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `fcf0aec` | 2026-09-28 | feat: backend for user bug reports and feedback with GitHub issue sync | yes |
| `bac2c07` | 2026-09-28 | feat: capture diagnostics in the frontend for bug reports | yes |
| `fb6ea23` | 2026-09-28 | feat: in-app bug report and feedback dialogs | yes |

---

### 5.11 Backend restructuring and tests

#### What changed

The single `models.py`, `serializers.py` and `views.py` were each split into a package with one module per domain. One-time scripts moved out of the app. Tests were consolidated into `backend/tests/` and grew from a placeholder to 187 tests.

#### How it works

1. **Packages.** `apps/inventory/models/` has `chemicals.py`, `containers.py`, `locations.py` and `labels.py`. Its `__init__.py` re-exports every name, so `from apps.inventory.models import Container` still works everywhere and Django still discovers the models. Serializers and views follow the same layout.
2. **Circular imports.** `ContainerSerializer` needs `LocationSerializer`, and the location-with-containers serializer needs `ContainerSerializer`. Both directions are kept in `serializers/containers.py` with a comment saying why ([lines 173-176](../backend/apps/inventory/serializers/containers.py#L173-L176)).
3. **Scripts.** The Notion import and reconciliation scripts live in [backend/scripts/onetime/](../backend/scripts/onetime/) and the PubChem enrichment in [backend/scripts/](../backend/scripts/). They are run by hand and set `DJANGO_SETTINGS_MODULE` themselves. The reconcile script defaults to a dry run.
4. **Tests.** [conftest.py](../backend/tests/conftest.py) provides factory fixtures: `make_location`, `make_container`, and `client_as(role)`, which returns an API client already authenticated as a new user with that role. Tests are grouped in classes by feature.

| File | Tests | Covers |
|------|-------|--------|
| [test_inventory_views.py](../backend/tests/test_inventory_views.py) | 49 | Transfer, move, location create, weigh-in, filters, query counts, role permissions |
| [test_storage_rules.py](../backend/tests/test_storage_rules.py) | 30 | Every rule and the 409 flow |
| [test_feedback.py](../backend/tests/test_feedback.py) | 22 | Reports, throttling, issue content, GitHub client |
| [test_users.py](../backend/tests/test_users.py) | 17 | Registration, profile, user management |
| [test_sds.py](../backend/tests/test_sds.py) | 17 | Permissions, search, both create paths |
| [test_inventory_models.py](../backend/tests/test_inventory_models.py) | 15 | CAS validation, location tree, computed fields |
| [test_labels.py](../backend/tests/test_labels.py) | 11 | Constraints, permissions, nested writes |
| [test_dashboard.py](../backend/tests/test_dashboard.py) | 4 | Restock soon |

The counts are of `def test_` lines. Parametrised tests run more than once, which is how they add up to 187.

#### Key files

- [backend/apps/inventory/models/__init__.py](../backend/apps/inventory/models/__init__.py)
- [backend/tests/conftest.py](../backend/tests/conftest.py)
- [backend/scripts/onetime/reconcile_notion_data.py](../backend/scripts/onetime/reconcile_notion_data.py)

#### Check your understanding

1. After the split, why does `from apps.inventory.models import Container` still work?
2. What does `client_as` do, and what does `force_authenticate` skip that a real browser goes through?
3. What are the query-count tests protecting against?
4. Name three behaviours that have no test.
5. What did the `validate_cas` fix change?

<details><summary>Answers</summary>

1. `models/__init__.py` imports each name from its module and lists it in `__all__`.
2. It creates a user with the given role and returns an `APIClient` that acts as that user. `force_authenticate` skips the login request, the session cookie and CSRF checking. Only one test in [test_sds.py](../backend/tests/test_sds.py) uses a real session login.
3. A later change quietly reintroducing a query per row or per tree node.
4. Container creation (`ContainerView.create`), check-out and check-in on their own, writes through the dashboard route, location update by role, anything in the bridge, and anything in the frontend.
5. It now checks the format before parsing the digits, so malformed input raises `ValidationError` (a 400) instead of `ValueError` or `IndexError` (a 500).

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| **The most complicated view has no test.** `ContainerView.create` handles single chemicals, mixtures, the first weight reading and the storage check, and findings 4 and 9 are both in it. | Verified (read) | High |
| The registration test asserts the Lab Manager default (finding 1), so the suite would fail if you fixed the bug without updating the test. | Verified (read): [test_users.py:44-61](../backend/tests/test_users.py#L44-L61) | Note |
| Permission tests cover a sample of role and action pairs. The two holes found (dashboard, location update) are in the pairs that were not sampled. | Verified (tested) | Medium |
| `test_smoke.py` is still the placeholder `assert True`. | Verified (read) | Trivial |
| Several models use `on_delete=DO_NOTHING`, which leaves integrity to the database and produces a 500 on a blocked delete. | Verified (read): [models/containers.py:24](../backend/apps/inventory/models/containers.py#L24), [line 135](../backend/apps/inventory/models/containers.py#L135) | Low |
| Comments often narrate history ("used to", "replaces a former"). They are accurate today, but they are long, and they will not be updated when the code changes. | Verified (read) | Style |

#### Compared with professional practice

**Matches common practice**
- Packages per domain with re-exports. This is how Django projects grow past one file.
- pytest with fixtures and factory functions in `conftest.py`.
- Regression tests named for the bug they prevent.
- External services mocked in tests; CI runs against a real PostgreSQL.
- A dry-run default on a script that writes to production data.

**Differs, and that is fine here**
- No coverage measurement. Useful, not essential at this size.
- Scripts that bootstrap Django by hand instead of being management commands. They are one-time tools.
- Hand-built fixtures instead of `factory_boy`. Fine with this few models.

**Differs, and worth changing**
- **Test the views with the most logic first.** A professional review would not accept `create` without tests. Five or six cases: single new chemical, existing chemical, mixture, blank optional fields, missing fields, storage conflict.
- **Put history in commit messages, not comments.** A comment should say why the code is the way it is. How it got there belongs in `git log`, where it cannot go stale. Many of these comments could be cut to a third of their length.
- **Use `PROTECT` or `SET_NULL` instead of `DO_NOTHING`** so Django raises a catchable error.
- **Add `pytest-cov`** and look at the report once. It will point straight at `create`.

#### Commits

8 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `193913d` | 2026-09-01 | Split apps/inventory/models.py into models/ package by domain |  |
| `43556ce` | 2026-09-01 | Split apps/inventory/serializers.py into serializers/ package by domain |  |
| `ebbe73c` | 2026-09-01 | Split apps/inventory/views.py into views/ package by domain |  |
| `b8b678e` | 2026-09-01 | Archive the Notion import script out of apps/inventory |  |
| `6ffd643` | 2026-09-01 | Move the orphaned PubChem enrichment script out of apps/inventory |  |
| `c390806` | 2026-09-01 | Fix validate_cas crashing on malformed input instead of rejecting it |  |
| `f52fc49` | 2026-09-01 | Consolidate tests into backend/tests/, add real coverage |  |
| `f4f1983` | 2026-09-01 | Reword the "Reset IDs on failed creates" TODO into an explanation |  |

---

### 5.12 Frontend structure and shared components

#### What changed

Most of the frontend's plumbing was reorganised: one error type for all API failures, a query-key factory, a shared data table, shared form fields, a confirmation dialog pattern, and a split of each large detail page into view, edit form and shared fields.

#### How it works

1. **`apiFetch` and `ApiError`** ([client.ts](../frontend/src/api/client.ts)). Every Django call goes through `apiFetch`, which sends the session cookie, adds the CSRF header on writes, and leaves `Content-Type` alone for `FormData`. Any non-2xx response throws an `ApiError` with `status`, the raw `body`, a readable `message`, and `fieldErrors` flattened from DRF's shapes ([lines 60-100](../frontend/src/api/client.ts#L60-L100)).
2. **Putting server errors on fields.** [applyApiErrors.ts](../frontend/src/components/shared/applyApiErrors.ts) takes an `ApiError` and calls react-hook-form's `setError` for each field that exists in the form, returning whatever is left for a form-level alert.
3. **Query keys** ([queryKeys.ts](../frontend/src/api/queryKeys.ts)). Each resource has a small factory: `containerKeys.all`, `.list(params)`, `.detail(slug)`. Keys are arrays that share a prefix, so invalidating `.all` refreshes everything for that resource.
4. **Global query settings** ([main.tsx:42-53](../frontend/src/main.tsx#L42-L53)): one retry, five minutes before data is considered stale, and cache-level error hooks that feed the diagnostics buffer.
5. **`DataTable`** ([DataTable.tsx](../frontend/src/components/shared/DataTable.tsx)) wraps ag-grid with the MUI theme, loading and error overlays, pagination and sizing. Containers, Chemicals, Users, Label Templates, weigh-in history and the Locations container list all use it.
6. **Form fields.** `RhfTextField`, `RhfSelect` and `RhfDateField` wrap a MUI input in a react-hook-form `Controller`. `LocationSelect`, `QuantityUnitField`, `StorageCategorySelect`, `WeightField` and `FormActions` are built on those. Validation rules are in [formRules.ts](../frontend/src/components/shared/formRules.ts).
7. **Confirmation.** [useConfirmDialog.ts](../frontend/src/components/shared/useConfirmDialog.ts) holds "the thing awaiting confirmation" in state. One [ConfirmDialog](../frontend/src/components/shared/ConfirmDialog.tsx) per page serves any number of rows.
8. **Detail pages.** Container, Chemical and User each became a `Detail` (data and header), a `View` (read-only), an `EditForm`, and a `Fields` component shared with the create form.
9. **Routing and errors** ([App.tsx](../frontend/src/App.tsx)). Routes are a `RouteObject` array under one layout route with an `errorElement`. A 404 from the API is handled in the page by checking `error.status`, because the app has no route loaders.

#### Key files

- [frontend/src/api/client.ts](../frontend/src/api/client.ts), [queryKeys.ts](../frontend/src/api/queryKeys.ts)
- [frontend/src/components/shared/](../frontend/src/components/shared/)
- [frontend/src/App.tsx](../frontend/src/App.tsx), [main.tsx](../frontend/src/main.tsx)

#### Check your understanding

1. The server answers 400 with `{"email": ["Enter a valid email address."]}`. What are `message` and `fieldErrors` on the thrown `ApiError`?
2. Why are query keys built by a factory instead of written inline?
3. Why does `WeightField` receive its mutation as a prop instead of creating it?
4. The container form prints a label and then navigates away. How does the user still see the print result?
5. What does `staleTime: 5 minutes` mean for a user who transfers a container and then opens the Locations page?
6. Why does `apiFetch` skip `Content-Type` when the body is `FormData`?

<details><summary>Answers</summary>

1. `fieldErrors` is `{email: "Enter a valid email address."}` and `message` is that same string, the first field error.
2. So every caller agrees on the key, and invalidation by prefix is reliable. A typo in an inline key is a cache that never refreshes.
3. The page also triggers a scale read after a barcode scan. Sharing one mutation means one pending state and one disabled button for both triggers.
4. The result is written to `sessionStorage` by `setPendingActionResult`, and the destination page reads and clears it on mount.
5. Unless the transfer invalidated that query, the page shows cached data for up to five minutes. Transfer only invalidates the container list, so the Locations page can be stale.
6. The browser must set `multipart/form-data` with its own boundary. Forcing `application/json` would break the upload.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| **No tests of any kind.** No Vitest, no Testing Library, no Playwright. `parseBarcode`, `ApiError`, `scrub`, `toQueryString` and `cas_is_valid` are pure functions and trivial to test. | Verified (read): [package.json](../frontend/package.json) | Medium |
| `createBrowserRouter` is called inside the `App` component, so the router is rebuilt each time `App` renders, which happens on login, logout and profile update. React Router's documentation says to create it once, outside the component tree. | Verified (read): [App.tsx:185](../frontend/src/App.tsx#L185) | Low |
| Invalidation is uneven. Some mutations invalidate `.all`, some only `.list()`, and transfer does not touch location queries. | Verified (read) | Low |
| `ContainerForm.tsx` is still 621 lines and holds several `useEffect`s that set form values from other form values. This is the hardest file in the frontend to follow. | Verified (read): [ContainerForm.tsx:160-252](../frontend/src/components/inventory/ContainerForm.tsx#L160-L252) | Low |
| ESLint has the TypeScript and hooks rules but no general React plugin, so missing keys are not reported. | Verified (read): [eslint.config.js](../frontend/eslint.config.js) | Low |
| Column definitions held in `useState` capture `canEdit` from the first render. Harmless today because the role cannot change while the page is mounted. | Verified (read): [Containers.tsx:211-246](../frontend/src/components/inventory/Containers.tsx#L211-L246) | Low |

#### Compared with professional practice

**Matches common practice**
- A single fetch wrapper and a single typed error. Most professional React codebases have exactly this file.
- A query-key factory. This is the pattern TanStack Query's own maintainers recommend.
- Server state in TanStack Query, form state in react-hook-form, and very little hand-rolled global state.
- TypeScript types generated from the backend's OpenAPI schema by a commit hook. Many teams aim for this and do not get there.
- Generic, typed shared components.
- Session cookies with CSRF and no tokens in JavaScript, which follows OWASP's guidance for browser apps.

**Differs, and that is fine here**
- Derived effects in the container form. A larger team would move the tare calculation into a custom hook or a schema library such as Zod. It works and is commented.
- No global toast system; each page owns its snackbar.
- No code splitting. The bundle is small and served on a local network.

**Differs, and worth changing**
- **Add a test runner.** Vitest takes about fifteen minutes to set up with Vite. Start with the pure functions, then one component test for `ScannableFieldRow`, which has the trickiest behaviour in the app. Add `pnpm test` to CI.
- **Create the router once.** Move the route array and `createBrowserRouter` to module scope and read auth inside the route elements, which `RequireAuth` and `RequireRole` already do.
- **Pick one invalidation rule.** For example: every mutation invalidates the `.all` key of each resource it touches.
- **Add `eslint-plugin-react`** for `jsx-key` and related rules.

#### Commits

21 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `776b4f5` | 2026-07-07 | swtiched routes to RouteObject and added some active navlink styling |  |
| `0359440` | 2026-07-07 | swtiched routes to RouteObject and added some active navlink styling |  |
| `986b0f7` | 2026-07-07 | Refactor inventory API queries to use centralized query keys for containers, chemicals, and locations |  |
| `d8863f9` | 2026-07-07 | moved the last few useEffect to useQuery |  |
| `0d8c696` | 2026-07-14 | Refactor inventory components to use DataTable for better code reuse and error handling |  |
| `74c4797` | 2026-07-15 | chore: refactor UI components for better structure and readability; introduce ActionFormCard for shared layout |  |
| `3ffaf28` | 2026-08-19 | feat: implement ChemicalRow and MixtureFields components; refactor ContainerForm for better structure and r… |  |
| `5e33318` | 2026-09-01 | Resolve AuthProvider TODO: memoize context actions and value |  |
| `bb98c14` | 2026-09-01 | Resolve ContainerForm TODO: drive the unit Select off real loading state |  |
| `3dacde7` | 2026-09-01 | Resolve WeighinTable transparency TODO by switching to the shared DataTable |  |
| `4249ed9` | 2026-09-01 | Resolve client.ts TODOs: unify error handling behind one ApiError shape |  |
| `71dd18e` | 2026-09-01 | Close three stale TODOs: ContainerForm wrappers, Containers data-fetching |  |
| `6152bdf` | 2026-09-01 | Resolve App.tsx error-page TODOs, and fix 404s that never actually worked |  |
| `9900328` | 2026-09-02 | Add ConfirmDialog and useConfirmDialog components for confirmation flows |  |
| `323273b` | 2026-09-02 | Add confirmation dialogs for checkout, weigh-in, and location deletion processes |  |
| `94de3b7` | 2026-09-02 | Add confirmation dialogs for move and transfer actions with improved error handling |  |
| `4932a70` | 2026-09-23 | refactor: add shared LocationSelect, QuantityUnitField, and FormActions | yes |
| `39f2f44` | 2026-09-23 | refactor: split ContainerDetail into view and edit form | yes |
| `5eb4aec` | 2026-09-23 | refactor: split ChemicalDetail and share fields with AddChemical | yes |
| `30c2d72` | 2026-09-23 | refactor: split UserDetail and share fields with Profile | yes |
| `81fc2dd` | 2026-09-23 | refactor: remove ToggleField | yes |

---

### 5.13 UI and UX changes

#### What changed

A long series of interface changes: a redesigned dashboard, inline editing in the container table, a mobile navigation drawer, a location tree with an actions menu and a container preview panel, a redesigned container detail card, GHS pictogram images, chemical formula subscripts, and loading and error states throughout.

#### How it works

1. **Dashboard** ([Dashboard.tsx](../frontend/src/components/inventory/Dashboard.tsx)). Three cards from one request: recently added, checked out, restock soon. "View more" links to `/inventory/containers/?view=<key>`.
2. **Container views.** [Containers.tsx](../frontend/src/components/inventory/Containers.tsx) turns `?view=` into API parameters for two of the views and filters the third in the browser ([lines 59-74](../frontend/src/components/inventory/Containers.tsx#L59-L74), [169-175](../frontend/src/components/inventory/Containers.tsx#L169-L175)).
3. **Inline editing.** Manufacturer and product number cells are editable for Stockroom and up. ag-grid applies the edit immediately; `onCellValueChanged` sends a PATCH, and whether it succeeds or fails the list is refetched so the grid ends up showing what the server has ([lines 256-276](../frontend/src/components/inventory/Containers.tsx#L256-L276)).
4. **Locations** ([Locations.tsx](../frontend/src/components/inventory/locations/Locations.tsx)). `Location` is a component that renders itself for each child. The selected location is in the URL as `?location=<id>`, so it can be bookmarked and survives the back button. A row starts expanded if the selection is somewhere beneath it. On wide screens, clicking a container shows it in a preview panel.
5. **Batch add.** [AddLocation.tsx](../frontend/src/components/inventory/locations/AddLocation.tsx) can create several sibling locations at once and print their labels. The server creates them in one transaction ([views/locations.py:70-104](../backend/apps/inventory/views/locations.py#L70-L104)).
6. **Navbar** ([Navbar.tsx](../frontend/src/components/nav/Navbar.tsx)). Desktop buttons with a popper submenu, and a drawer below the breakpoint. Items are shown by role.
7. **Small pieces.** [ghsPictograms.ts](../frontend/src/components/shared/ghsPictograms.ts) maps hazard codes to the images in `public/ghs/`, drawn on a white background so they stay visible in dark mode. [ChemicalFormula.tsx](../frontend/src/components/shared/ChemicalFormula.tsx) renders digits in a formula as subscripts. [NotFound.tsx](../frontend/src/components/shared/NotFound.tsx) provides the 404 and error pages.

#### Key files

- [frontend/src/components/inventory/Dashboard.tsx](../frontend/src/components/inventory/Dashboard.tsx)
- [frontend/src/components/inventory/Containers.tsx](../frontend/src/components/inventory/Containers.tsx)
- [frontend/src/components/inventory/locations/Locations.tsx](../frontend/src/components/inventory/locations/Locations.tsx)
- [frontend/src/components/nav/Navbar.tsx](../frontend/src/components/nav/Navbar.tsx)

#### Check your understanding

1. Why is the selected location stored in the URL and not in `useState`?
2. An inline edit fails on the server. How does the cell get back to its old value?
3. Which of the three dashboard views is filtered in the browser, and why that one?
4. What does the delete confirmation for a location promise, and what does the server do?
5. How does the tree know to open the branch containing a bookmarked location?

<details><summary>Answers</summary>

1. So a link to a location can be shared or bookmarked, and the browser's back and forward buttons work.
2. `onSettled` invalidates the container list on success and on failure. The refetch replaces the grid's optimistic value with the server's.
3. Restock soon. It depends on `percent_remaining`, which is computed in Python per container and is not a database column the API can filter on.
4. The dialog says the delete "also removes any child locations". The server refuses to delete a location that has children or containers and returns a 400 explaining that. The dialog text is wrong ([Locations.tsx:368](../frontend/src/components/inventory/locations/Locations.tsx#L368), [views/locations.py:212-223](../backend/apps/inventory/views/locations.py#L212-L223)).
5. Each row's initial `expanded` state is computed by `containsLocation`, which searches its descendants for the selected id.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| The location delete dialog describes a cascade that does not happen. | Verified (read) | Low |
| "All locations" on the Locations page requests the full container list, the 23-second path from finding 5. | Verified (read): [Locations.tsx:307-317](../frontend/src/components/inventory/locations/Locations.tsx#L307-L317) | Medium |
| Editing a location from the tree relies on the frontend's role check alone (finding 8). | Verified (tested) | Medium |
| The container form's card is fixed at `maxWidth: 50vw`, which is narrow on a phone. | Worth a look: [ContainerForm.tsx:385-393](../frontend/src/components/inventory/ContainerForm.tsx#L385-L393) | Low |
| Accessibility has not been checked. Several icon-only buttons have a tooltip but no `aria-label`. | Worth a look | Low |

#### Compared with professional practice

**Matches common practice**
- UI state that should be shareable lives in the URL.
- Loading, empty and error states on tables.
- One component library used consistently, with a theme, and dark mode handled in the theme.
- Refetching after an optimistic edit so the UI cannot drift from the server.

**Differs, and that is fine here**
- No design system documentation or Storybook. One developer and one component library do not need them.
- Desktop-first layouts. The stockroom PC is the main client.

**Differs, and worth changing**
- **Check UI text against behaviour.** The delete dialog is the kind of mismatch that a quick manual test plan per feature would catch.
- **Run an accessibility pass.** The `axe` browser extension on each page takes an afternoon, and universities usually have accessibility obligations.
- **Try each page at phone width**, since the project plan expects phone use for camera scanning later.

#### Commits

17 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `807bc17` | 2026-07-07 | bugfix: Corrected Location display in table |  |
| `7f58f11` | 2026-07-14 | Improved UI for dashboard cards |  |
| `6ed764a` | 2026-07-14 | feat: add inline cell editing to the containers table |  |
| `337bf9e` | 2026-07-15 | feat: enhance UI/UX across inventory components with improved layouts and added tooltips |  |
| `c8e3fee` | 2026-07-15 | chore: clean up UI/UX in Chemicals and Locations components for improved readability |  |
| `583b15e` | 2026-07-15 | update check in submit button text for better UX |  |
| `c43c9e0` | 2026-07-15 | Updated button layout to match other components |  |
| `a8af5f9` | 2026-07-15 | chore: enhance UI/UX in Locations component with improved button visibility and layout |  |
| `1043847` | 2026-07-15 | chore: enhance Navbar component with Popper for actions menu and improve UX with ClickAwayListener |  |
| `96824f6` | 2026-07-16 | chore: enhance inventory components with loading states, improved error handling, and UI refinements |  |
| `f643567` | 2026-09-01 | Resolve Dashboard TODO: "View More" links to a filtered Containers view |  |
| `c00006e` | 2026-09-01 | Resolve Locations TODO: selected location lives in the URL |  |
| `c5b26b2` | 2026-09-01 | Resolve Navbar TODO: functional mobile menu |  |
| `9325736` | 2026-09-23 | feat: enhance location component with actions menu and improve UI structure |  |
| `b61d781` | 2026-09-23 | feat: add container preview panel to locations page | yes |
| `383d879` | 2026-09-23 | feat: redesign container detail card and preview panel | yes |
| `637a73b` | 2026-09-23 | feat: show chemical formula subscripts on the chemical detail page | yes |

---

### 5.14 Deployment and operations

#### What changed

The app moved from a development laptop to a Raspberry Pi in the stockroom. nginx serves everything from one address, systemd runs the services, a nightly job backs up the database to disk and Google Drive, and a script deploys new versions.

#### How it works

1. **One origin.** [labmanager.nginx](../deploy/pi/labmanager.nginx) listens on port 80. `/api/` and `/admin/` go to gunicorn on 127.0.0.1:8000, `/bridge/` to uvicorn on 127.0.0.1:8200 with the prefix stripped, `/static/` to Django's collected files, and everything else to the built frontend with a fallback to `index.html` so client-side routes work on refresh.
2. **Frontend build settings.** [.env.production](../frontend/.env.production) sets `VITE_API_URL` to an empty string and `VITE_BRIDGE_URL` to `/bridge`, so the browser calls the host that served the page.
3. **Services.** [labmanager-api.service](../deploy/pi/labmanager-api.service) runs gunicorn with three workers. [labmanager-bridge.service](../deploy/pi/labmanager-bridge.service) runs uvicorn. Both restart on failure and start at boot. **systemd** is Linux's service manager; a unit file describes how to run one process.
4. **Settings for production** ([settings.py](../backend/config/settings.py)). `DEBUG` defaults to off. `COOKIE_SECURE` defaults to on whenever debug is off, and is set to `False` on the Pi because browsers will not send secure cookies over plain HTTP ([line 113](../backend/config/settings.py#L113)). `TRUST_PROXY_HEADERS` is ready for the day nginx terminates HTTPS.
5. **Backups.** [labmanager-backup.timer](../deploy/pi/labmanager-backup.timer) fires at 02:00, or at the next boot if the Pi was off. It runs [backup_db.py](../backend/apps/inventory/management/commands/backup_db.py), which:
   - runs `pg_dump` in custom format to a `.partial` file and renames it only on success
   - deletes local dumps older than 14 days
   - uploads the dump to a private Drive folder and trashes Drive copies older than 14 days
   - exits non-zero if the upload fails, so the unit shows as failed
6. **Deploying** ([deploy.sh](../deploy/pi/deploy.sh)). In order: refuse if the Pi has local edits to tracked files; fetch and fast-forward or check out a given ref; install dependencies; build the frontend into `dist-next`; back up the database; migrate and collect static files; swap `dist-next` into place; restart the services; check three URLs through nginx. Everything that can fail without touching the live site runs before anything that changes it.
7. **Windows alternative.** [bridge/scripts/](../bridge/scripts/) installs the bridge as a Windows service with NSSM, for running it on the stockroom PC.
8. **CI and hooks.** Three workflows in [.github/workflows/](../.github/workflows/) lint, format-check, and (backend) migrate and test, or (frontend) build. [.githooks/pre-commit](../.githooks/pre-commit) regenerates the OpenAPI schema and TypeScript types; [pre-push](../.githooks/pre-push) runs the format and lint checks.

The full walkthrough, with what differed from the plan, is in [the deployment plan](Lab%20Manager%20on%20a%20Raspberry%20Pi%20—%20Deployment%20Plan.md) and [deploy/pi/README.md](../deploy/pi/README.md).

#### Key files

- [deploy/pi/](../deploy/pi/)
- [backend/config/settings.py](../backend/config/settings.py)
- [backend/apps/inventory/management/commands/backup_db.py](../backend/apps/inventory/management/commands/backup_db.py)
- [.github/workflows/](../.github/workflows/)

#### Check your understanding

1. Trace `GET /api/inventory/containers/` from the browser to PostgreSQL on the Pi.
2. Why is `VITE_API_URL` empty in production, and why is that different from unset?
3. What does `deploy.sh` do before it changes anything users can see, and what can a rollback not undo?
4. Where do backups go, how long are they kept, and how would you find out that last night's failed?
5. What does `COOKIE_SECURE=False` do, and what is the cost?
6. Why does nginx need `try_files $uri /index.html`?

<details><summary>Answers</summary>

1. Browser to nginx on port 80; nginx matches `/api/` and proxies to gunicorn on 127.0.0.1:8000; a worker runs Django's middleware, the URL router, DRF authentication and permissions, then `ContainerView.list`; the ORM queries PostgreSQL on localhost.
2. Empty makes requests relative to the current host (`/api/...`). `client.ts` uses `??`, which keeps an empty string but would replace an unset value with `http://localhost:8000`.
3. Checks for local edits, pulls, installs, builds the frontend beside the live one, and backs up the database. A rollback restores the code but not the database; if the bad deploy ran a migration you must restore the dump taken in that step.
4. `/var/backups/labmanager` and a private Drive folder, both for 14 days. You would have to look: `systemctl status labmanager-backup` or `journalctl -u labmanager-backup`. Nothing notifies you.
5. It lets the browser send session and CSRF cookies over HTTP, which the site needs to work without TLS. The cost is that the cookies, and the login password, are readable by anyone who can observe the network traffic.
6. A URL like `/inventory/containers/chem-5` is a React route, not a file. Without the fallback, refreshing the page would be a 404 from nginx.

</details>

#### Concerns

| Concern | Evidence | Severity |
|---------|----------|----------|
| **No TLS (finding 7).** Listed in the deployment plan with a mitigation path. It makes finding 1 worse, because the registration page is reachable by anyone on the network. | Verified (read) | Medium |
| **The bridge is unauthenticated behind nginx (finding 6).** In the original design it listened on localhost of the lab PC, where only that PC could reach it. On the Pi it is published to the network. | Verified (read) | Medium |
| **A failed backup is silent (finding 14).** The command exits non-zero so systemd records the failure, but nothing sends it anywhere. | Verified (read) | Medium |
| `SECRET_KEY` falls back to a fixed string if the variable is missing. A production start with a missing `.env` would run with a publicly known key. | Verified (read): [settings.py:10](../backend/config/settings.py#L10) | Medium |
| The `.env` files and `secrets/` (service account key, GitHub App key) are not in the backup. Losing the SD card means recreating them by hand. | Verified (read) | Medium |
| No `LOGGING` configuration. Server errors go to the journal with Django's defaults, and there is no error alerting. | Verified (read) | Medium |
| Services run as your personal login account, which also owns the repo and has `sudo`. | Verified (read): [labmanager-api.service:7](../deploy/pi/labmanager-api.service#L7) | Low |
| `backup_db` needs `SDS_DRIVE_FOLDER_ID` to be set even though it uploads to a different folder, because both share `_get_client`. | Verified (read): [drive.py:26-31](../backend/apps/inventory/drive.py#L26-L31) | Low |
| A restore has been tested once, by hand. There is no periodic restore test. | From your deployment notes | Low |
| CI does not run for pull requests into `develop` (finding 13). | Verified (read) | Medium |
| A tag named `v1.01` sits beside `v1.0.0`, `v1.0.1` and `v1.0.2`. | Verified (measured) | Trivial |

#### Compared with professional practice

**Matches common practice**
- nginx as a reverse proxy in front of gunicorn. This is the standard Django deployment.
- systemd units and timers, checked into the repository.
- Configuration in environment variables, secrets out of git, an `.env.example` per service.
- A deploy script that fails early, builds beside the live copy, backs up before migrating, and health-checks afterwards. This is more careful than many small production setups.
- Backups written atomically, with retention, stored off the device, and a tested restore.
- Lockfiles committed and `--frozen-lockfile` in CI.

**Differs, and that is fine here**
- A Raspberry Pi instead of a managed server or container platform. The project plan's constraint is what IT will permit.
- Deploying by SSH and a shell script instead of a pipeline. Appropriate for one machine.
- No staging environment. Your laptop fills that role.
- A few seconds of downtime on each deploy.
- Google Drive as the off-site backup target.

**Differs, and worth changing**
- **HTTPS.** The standard is TLS everywhere, including internal tools. If IT cannot issue a certificate, a self-signed one installed on the stockroom PCs is still better than none. It is also a requirement for the phone-camera scanning in Milestone 2.
- **Fail closed on secrets.** Raise an error at start-up if `SECRET_KEY` is unset and `DEBUG` is off. Django's deployment checklist (`manage.py check --deploy`) lists this and several related settings; run it once and read the output.
- **Alert on failure.** An `OnFailure=` unit that sends an email, or a free dead-man's-switch service that expects a ping after each successful backup. Backups that nobody is watching are the most common way small systems lose data.
- **Protect the bridge.** nginx's `auth_request` can ask Django whether the session is logged in before proxying `/bridge/`. About twenty lines of nginx and one small view.
- **Run CI on every pull request**, not only those into `main`. One line in each workflow.
- **A dedicated service account** on the Pi with no login shell and no `sudo`.
- **Back up the secrets** somewhere safe and separate, such as a password manager.

#### Commits

10 commits.

| Commit | Date | Subject | Tagged co-authored |
|--------|------|---------|--------------------|
| `f65b479` | 2026-07-14 | Updated pre-commit hook to run prettier |  |
| `af8e781` | 2026-07-15 | chore: update settings and .gitignore for Playwright MCP integration |  |
| `55df7da` | 2026-09-14 | chore: stop tracking .claude/settings.json |  |
| `f178219` | 2026-09-16 | chore: add pnpm workspace overrides for dependency versions |  |
| `637499f` | 2026-09-16 | feat: add scripts to install and uninstall the bridge as a Windows service |  |
| `2c6fc4e` | 2026-09-17 | Updated lock file |  |
| `6f1aa50` | 2026-09-29 | feat: prepare the app to be served from one origin on the Raspberry Pi | yes |
| `ba9f44b` | 2026-09-30 | feat: nightly database backups to local disk and Google Drive | yes |
| `d526778` | 2026-09-30 | docs: Pi deployment plan with as-built notes, deploy files, switch-back guide | yes |
| `c6ed9c0` | 2026-09-30 | feat(deploy): deploy script for the Pi | yes |

---

## 6. Professional practice: project-wide

### Scorecard

| Category | Matches practice | Fine at this scale | Worth changing |
|----------|------------------|--------------------|----------------|
| 5.1 Balance | Thin routes, env config, 503 on device errors | Port opened per request | Parser tests, a lock |
| 5.2 Printer | Transport abstraction, documented protocol | Hand-rolled protocol, default SNMP community | Input validation and sanitising |
| 5.3 Label templates | DB constraints, nested serializer, role tests | Browser orchestrates the print | A display string used as an identifier |
| 5.4 Scanning and actions | Atomic bulk writes, confirmation step | Keyboard-wedge scan detection | Serializers for request bodies, one id normaliser, remove dead code |
| 5.5 Weights and tare | Derived values, one formula, data migration | Dashboard computed in Python | Real append-only history, unit normalisation, narrow view class |
| 5.6 SDS | Object storage plus pointer, mocked tests | Drive as storage, public links | Content check, smaller commits |
| 5.7 Roles | Permission classes, deny by default, server-side enforcement | No SSO, rank table copied to the frontend | **Least privilege at registration**, allow-list gating, login throttle |
| 5.8 Search and performance | django-filter, query-count tests | Client-side pagination | **Container list queries**, pagination, a query profiler |
| 5.9 Storage rules | Pure rule module, thorough tests, 409 handshake | Confirm flag in the body | Audit trail of overrides |
| 5.10 Bug reports | Public/private split, GitHub App auth, throttling | Built in-house, synchronous send | Scheduled retry, shared cache |
| 5.11 Backend structure and tests | Domain packages, pytest fixtures, CI with Postgres | No coverage tool | Tests for `create`, shorter comments |
| 5.12 Frontend structure | Fetch wrapper, key factory, generated types | Derived effects in one big form | **A test runner**, router created once |
| 5.13 UI | URL state, loading and error states | Desktop-first | Accessibility pass, text matches behaviour |
| 5.14 Deployment | nginx and gunicorn, systemd, careful deploy script, off-site backups | A Pi, shell deploy, no staging | **HTTPS**, alerting, bridge auth, fail-closed secrets |

### Workflow

**Branching and pull requests.** The history shows 59 merged pull requests in a consistent flow: a `cp/<type>/<name>` branch into `develop`, then `develop` into `main`, with version tags. This is a recognisable Git Flow and is what many teams do. What differs is that every pull request is self-merged with no reviewer. On a solo project that cannot be avoided, but it means the pull request is doing the job of a save point and not a review. Two things substitute for a reviewer: CI that must pass before merging, and reading your own diff on GitHub before you click merge.

**Commit messages.** 55 of the 124 commits follow the Conventional Commits format (`feat:`, `fix(bridge):`). The rest range from clear sentences to `Updated lock file`. The September commits are consistently better than July's. Pick the convention and keep to it; it makes `git log` searchable and release notes easy.

**Commit size.** Most commits are focused. A few are very large: `c606d70` (SDS, about 2,000 lines over 39 files) and `fcf0aec` (bug report backend, about 1,150 lines). Large commits are the typical shape of LLM-assisted work, and they are the ones you are least likely to have read line by line. For future features, ask for the work in steps and commit each: model and migration, then API and tests, then UI.

**Continuous integration.** The three workflows are well set up: path filters, a real PostgreSQL service, lint, format check, migrate, test, build. Gaps:

- Pull requests into `develop` are not checked; the workflows run on push to `develop`, which is after the merge.
- The bridge workflow only lints.
- The frontend workflow has no tests to run.
- Branch protection is not visible from the repo. If `main` and `develop` do not require a passing check, turn that on.

**Hooks.** Regenerating `openapi.json` and `types/api.ts` on every commit keeps the frontend types honest and is a good idea. It depends on `git config core.hooksPath .githooks` having been run on each machine, which the README does not mention, and it makes every commit slow. CI could check that the generated files are up to date instead.

**Tests.** 187 backend tests in 28 seconds is a healthy base. Coverage follows the September features closely (storage rules, feedback, SDS, labels) and is thin on the oldest and most complicated code (`ContainerView.create`, check-out). The frontend and bridge have none. The findings in section 2 line up with those gaps almost exactly: every High finding is in code with no test for that behaviour.

**Dependencies.** Lockfiles are committed. `pnpm-workspace.yaml` carries overrides for security advisories, which shows the advisories are being watched. `@mui/lab` is pinned to a beta. Nothing automates updates; Dependabot or Renovate would open the pull requests for you.

**Secrets and configuration.** `.env` files and `secrets/` are ignored, each service has an `.env.example`, and settings read from the environment. The exceptions are the `SECRET_KEY` fallback and the absence of `manage.py check --deploy` from any checklist.

**Observability.** The bug-report feature gives you user-initiated reports with context. There is no server-side logging configuration, no error tracking and no alerting, so a 500 that no user reports is invisible unless you read the journal.

**Documentation.** The planning documents are a real strength: the project plan, the printer notes, the bug-reporting plan and the deployment plan with its "as built" notes are better than most small projects have. The weakness is drift, covered in section 7.

**Comments.** The LLM-written code is heavily commented, and most comments explain a reason, which is the valuable kind. Many also tell the story of earlier versions. A professional codebase puts that in the commit message. As a rule of thumb: if a comment contains "used to", "previously" or "replaced", move it to `git log`.

### How this compares with a junior developer's first production project

Favourably on structure, tooling, deployment care and documentation. The layering is conventional, the libraries are mainstream and used the way their documentation intends, and the deploy and backup setup is more careful than is typical.

The gaps are the ones that LLM-assisted development tends to leave. The code that was asked for is thorough and tested. The code around it was not revisited: an old `TODO` that grants Lab Manager, a view class that exposes more than intended, a display format that leaked into an identifier, an unoptimised list beside three optimised ones. None of these is in the new code's happy path, so none was noticed. They are found by adversarial questions ("what can the lowest role do?", "what does the scanner really send?", "how many queries is this?") and by measurement, which is the habit most worth building next.

---

## 7. Stale documentation

| Document | What is out of date |
|----------|---------------------|
| [CLAUDE.md](../CLAUDE.md) | Says hardware integrations are "stubbed in `bridge/app/main.py` with TODO comments". They are implemented. |
| [CLAUDE.md](../CLAUDE.md) | Says the Brother printer uses "b-PAC/pywin32". It uses P-touch Template over a socket or USB. |
| [CLAUDE.md](../CLAUDE.md) | Says the current milestone is the MVP. Labels, barcodes, scanning and the balance (Milestones 2 and 4) are largely built. |
| [CLAUDE.md](../CLAUDE.md) | Describes `SDS` as a foreign key to Chemical. It is a foreign key to Container. |
| [CLAUDE.md](../CLAUDE.md) | Says `WeightReading.source` distinguishes manual from balance readings. The field does not exist. |
| [CLAUDE.md](../CLAUDE.md) | Does not mention `apps/feedback`, `deploy/`, Google Drive, the GitHub App, or the roles. |
| [docs/README.md](README.md) | Was a placeholder that told the reader to add the project plan. Updated with this review to list the documents. |
| [Roles_and_Permissions.md](Roles_and_Permissions.md) | Describes guests, non-members, an elevation-request model and a Coordinator with wider rights than Stockroom. The code has six roles in four ranks and none of the rest. |
| [Lab-Manager-App-Project-Plan.md](Lab-Manager-App-Project-Plan.md) | Header still reads "Status: Planning, pre-development". Section 5 says the bridge runs on the lab PC with the Brother SDK. |
| [backend/README.md](../backend/README.md) | Lists the auth endpoints only. No mention of the inventory or feedback APIs, the management commands, or the scripts. |
| [README.md](../README.md) | Does not mention `git config core.hooksPath .githooks`. |

CLAUDE.md matters most, because it is what an LLM reads before working on the project. A stale description there produces confidently wrong suggestions.

**Status, 1 October 2026:** every row above is fixed on the branch `cp/docs/stale_documentation`.

- CLAUDE.md was rewritten against the code: hardware, deployment, roles, the data model as built, external services, the git hooks and the current milestone state.
- Roles_and_Permissions.md is now the permission matrix the code enforces, with the open gaps (findings 6, 8 and 10) and the unbuilt ideas from the old notes listed separately.
- The project plan keeps its original text and gained a status header, a milestone status column and "As built" notes.
- The backend README lists every API area, the management commands and the scripts. The root README covers the git hooks.

Four things outside the table were also stale and were fixed: [bridge/PRINTER_PLAN.md](../bridge/PRINTER_PLAN.md) opened with "nothing here is implemented yet" and carried a finished TODO list, [frontend/README.md](../frontend/README.md) did not mention `VITE_BRIDGE_URL` or `.env.production`, and the bridge's module docstring and `.env.example` still said it runs on the lab PC.

The rest of this review was left as written, so its remarks about these documents (for example in sections 5.5, 5.7 and 6) describe them as they were at commit `68b27ea`.

---

## 8. Appendix: every commit, by category

Each commit in `40357e0..HEAD` (merges excluded) appears once, under the category that explains it. The full list is in each category's Commits table above; this is the count.

| Category | Commits | Tagged co-authored |
|----------|---------|--------------------|
| 5.1 Hardware bridge: balance | 3 | 3 |
| 5.2 Hardware bridge: label printer | 7 | 2 |
| 5.3 Label printing in the app and the template registry | 11 | 2 |
| 5.4 Scanning and container actions | 14 | 0 |
| 5.5 Weights, tare and computed container fields | 6 | 2 |
| 5.6 SDS and Google Drive | 11 | 11 |
| 5.7 Users, roles and permissions | 5 | 0 |
| 5.8 Search, filters and query performance | 5 | 0 |
| 5.9 Storage categories and conflict warnings | 3 | 2 |
| 5.10 Bug reports, feedback and diagnostics | 3 | 3 |
| 5.11 Backend restructuring and tests | 8 | 0 |
| 5.12 Frontend structure and shared components | 21 | 5 |
| 5.13 UI and UX changes | 17 | 3 |
| 5.14 Deployment and operations | 10 | 4 |
| **Total** | **124** | **37** |

"Tagged co-authored" counts commits whose message carries a `Co-Authored-By: Claude` line. Several untagged commits in September (the TODO clean-up, the package splits, roles, filters) read as LLM-assisted too, so the tag probably undercounts.

To read any commit: `git show <hash>`. To see only the files it touched: `git show --stat <hash>`.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Three independent services share this monorepo. Each has its own virtualenv / lockfile.

| Folder | What it is | Stack | Dev port |
|--------|------------|-------|----------|
| `frontend/` | Single-page app | React 19, Vite, TypeScript, MUI, TanStack Query, React Router, react-hook-form, ag-grid | 5173 |
| `backend/` | REST API and database | Django 6, DRF, django-filter, drf-spectacular, PostgreSQL, session auth | 8000 |
| `bridge/` | Hardware service (balance, label printer) | FastAPI, pyserial, pysnmp | 8200 |
| `deploy/pi/` | systemd units, nginx site and `deploy.sh` for the live Raspberry Pi | — | — |
| `docs/` | Plans, the post-MVP code review, reference documents (index in [docs/README.md](docs/README.md)) | — | — |

Backend apps: `apps/users` (auth, roles), `apps/inventory` (models, serializers and views are packages split by domain: chemicals, containers, locations, labels, plus `sds.py` and `dashboard.py` views), `apps/feedback` (bug reports and feedback). Backend tests are in `backend/tests/`. Frontend unit tests (Vitest) sit next to the code as `*.test.ts`; so far they cover `src/scanner/`. The bridge has no tests.

## Commands

All backend/bridge commands run from their respective directory with Poetry.

### Backend

```bash
cd backend
poetry run python manage.py runserver      # dev server
poetry run pytest                          # all tests
poetry run pytest path/to/test_file.py    # single test file
poetry run ruff check .                    # lint
poetry run ruff format .                   # format
poetry run ruff format --check .           # format check (CI)
poetry run python manage.py migrate        # apply migrations
poetry run python manage.py makemigrations # create migrations
poetry run python manage.py backup_db            # pg_dump to BACKUP_DIR (+ Drive); nightly on the Pi
poetry run python manage.py retry_github_issues  # resend bug reports whose GitHub issue failed
```

### Frontend

```bash
cd frontend
pnpm dev            # dev server
pnpm build          # type-check + production build
pnpm lint           # ESLint
pnpm format         # Prettier (write)
pnpm format:check   # Prettier (CI check)
pnpm test           # Vitest unit tests
```

### Bridge

```bash
cd bridge
poetry run uvicorn app.main:app --port 8200 --reload
poetry run ruff check .
poetry run ruff format .
```

### Git hooks and generated files

Hooks live in `.githooks/` and need `git config core.hooksPath .githooks` once per clone.

- **pre-commit** runs `scripts/generate-api-types.sh`, which regenerates `backend/openapi.json` (drf-spectacular) and `frontend/src/types/api.ts` (openapi-typescript), and stages both. Never edit those two files by hand; see [API schema and frontend types](#api-schema-and-frontend-types).
- **pre-push** runs Prettier, ESLint, `tsc -b` and Ruff, and refuses to run while `frontend/`, `backend/` or `bridge/` have uncommitted changes.

### Branching

Work branches are `cp/<type>/<snake_name>`, branched from and merged into `develop`. `develop` is merged into `main` for releases, which are tagged (`v1.1.0`). The Pi deploys from `main`, so a change is not live until it is released and `deploy/pi/deploy.sh` is run. A test site on the same Pi, `https://test.cplabmanager.com`, runs `develop` against a copy of the live database (setup and use in [deploy/pi/README.md](deploy/pi/README.md#test-site)). CI runs on push to `develop`/`main` and on pull requests into either; the `API types` workflow fails if `openapi.json` or `api.ts` is out of date.

### Commits

Commit as you go, not once per PR. Each commit should be one step that builds, passes lint and tests on its own, and can be reviewed by itself: a new shared component, then each page moved onto it, then the docs. A PR is usually several commits. Use conventional prefixes (`feat(scope):`, `fix(scope):`, `docs:`, `refactor:`, `test:`) and say in the body why, not just what. Don't squash a branch's commits before pushing; the history is how a reviewer follows the change.

## Architecture

### Request flow

The React SPA calls the Django REST API for all data, and calls the bridge to reach hardware the browser cannot touch (the balance and the Brother label printer).

- **Development:** three origins (5173, 8000, 8200). The frontend reads `VITE_API_URL` and `VITE_BRIDGE_URL`; Django and the bridge each allow `FRONTEND_ORIGIN` through CORS.
- **Production (the stockroom Raspberry Pi, live since 30 Sep 2026):** nginx serves everything from one origin, `https://app.cplabmanager.com` (`deploy/pi/labmanager.nginx`): `/` is `frontend/dist`, `/api/`, `/admin/` and `/static/` go to gunicorn on `:8000`, `/bridge/` goes to uvicorn on `:8200`. `frontend/.env.production` uses relative URLs, so CORS is not involved. nginx terminates TLS on 443 with a Let's Encrypt certificate (certbot, Cloudflare DNS challenge) and redirects port 80; Django learns the request was HTTPS through `TRUST_PROXY_HEADERS`. The name resolves to the Pi's private campus IP, so it only works on campus. Setup, renewal and rollback are in [deploy/pi/README.md](deploy/pi/README.md).

The bridge has no authentication of its own. `frontend/src/api/bridge.ts` is a separate fetch wrapper from `api/client.ts` because bridge calls carry no session or CSRF token.

### Hardware

- **Balance** (Adam CKT8UH, RS-232 through an FTDI USB-to-serial cable): `bridge/app/balance.py`. Sends `P` and parses the `Net Wt.` line; tare sends `T`. The port is found by the adapter's serial number, then FTDI VID/PID, then `BALANCE_SERIAL_PORT`.
- **Label printer** (Brother PT-P950NW): `bridge/app/printer.py`, using the printer's P-touch Template command language. No Brother SDK, b-PAC or Windows dependency. Label layouts live on the printer as numbered templates (transferred once from P-touch Editor on Windows); the bridge selects a template, fills named objects, and prints. Transport is a raw TCP socket on port 9100 or the USB device (`PRINTER_CONNECTION=usb`, what the Pi uses). Status comes from `^SR` over USB or SNMP over the network. Protocol notes are in [bridge/PRINTER_PLAN.md](bridge/PRINTER_PLAN.md).
- **Label template registry:** the `LabelTemplate` / `LabelTemplateField` tables record which templates are on the printer. The frontend (`components/shared/printTemplates.ts`) picks the template whose `media_width_mm` matches the tape the printer reports, then prints and checks printer status afterwards.
- **Bluetooth barcode scanner** (Tera HW0002): an HID keyboard. Labels encode JSON such as `{"id":"CHEM-0292"}` or `{"id":"LOC-12"}`. The scanner is programmed to send a backtick prefix before each scan ([docs/Barcode-Scanner.md](docs/Barcode-Scanner.md)), and `frontend/src/scanner/` listens for it app-wide: `ScannerProvider` swallows the scan's keys wherever focus is and hands the scan to the newest `useScanHandler` (a page or field claiming scans), else opens the container or location. The Actions page's four tabs are lists built on `components/shared/scanList/` (`useScanList`, `ScanListView`, `AddByIdField`): scans and comma-separated ids add items, then one confirm submits. Unit-tested with Vitest (`pnpm test`).
- **Phone camera:** the navbar's `CameraButton` lazy-loads `scanner/CameraScanner.tsx`, which decodes QR codes from `getUserMedia` (native `BarcodeDetector` on Android Chrome, else the bundled zxing-wasm decoder, `scanner/detector.ts`) and feeds each read to the same handlers through `submitScan`. It stays open between reads when the top handler was registered with `{ continuous: true }` (the Actions tabs), and closes when a handler returns `'done'`. Needs HTTPS (or localhost).
- Not built: Brady waste labels (Milestone 3).

### External services

- **Google Drive** (`apps/inventory/drive.py`): a service account uploads SDS PDFs to a shared drive with "anyone with the link can view", and `backup_db` uploads nightly database dumps to a private folder.
- **GitHub App** (`apps/feedback/github.py`, `issues.py`): bug reports from logged-in users are mirrored as issues on the public repo, carrying only what the user typed plus page, version and role. Captured diagnostics stay in the database, as do anonymous reports and feedback until a Lab Manager promotes them. Setup is in [docs/Bug-Reporting-Plan.md](docs/Bug-Reporting-Plan.md).

### Authentication and roles

Session-based. Frontend sequence on load:
1. `GET /api/auth/csrf/` — obtain CSRF token
2. `POST /api/auth/login/`
3. `GET /api/auth/me/`
4. `POST /api/auth/logout/`

Registration (`/api/auth/register/`) is open to `@lipscomb.edu` and `@mail.lipscomb.edu` addresses. The address is not verified. New accounts get the lowest role; a Lab Manager raises it through `/api/auth/users/`.

Six roles in four ranks (`apps/users/permissions.py`): Admin = Lab Manager (4), Coordinator = Faculty (3), Stockroom (2), Lab Assistant (1). Views gate actions with `role_at_least(User.Role.X)` in `get_permissions()`; `IsAuthenticated` is the global default. The usual pattern is: reads for any logged-in user, writes for Stockroom and up, deletes for Lab Manager and up. `frontend/src/components/shared/roles.ts` is a hand-kept copy of the rank table, used only to hide UI; the server enforces. The per-endpoint matrix is in [docs/Roles_and_Permissions.md](docs/Roles_and_Permissions.md).

SDS list/retrieve and bug report/feedback creation are public (`AllowAny`).

### Data model

- **Chemical** — catalog entry: name, IUPAC name, CAS (checksum-validated, unique), formula, PubChem CID, synonyms, molecular weight, `storage_category`. Mixtures are Chemicals linked to their components through **Ingredient**.
- **ChemicalStorageCategories** — Flinn storage pattern categories (O1–O10, I1–I11). `apps/inventory/storage_rules.py` uses them to warn on incompatible storage (HTTP 409, confirmable).
- **Container** — physical bottle; FK to Chemical and Location. Looked up by `slug` (`chem-292`). The `label` property is the zero-padded display form (`CHEM-0292`), which is what gets printed and scanned; `normalize_container_slug` converts any scanned form back to the slug. Holds quantity, unit, density, initial and tare weights, and dates. `percent_remaining` is a computed property and the only definition of that formula.
- **Location** — self-referencing tree (`parent` FK, nullable at root), `type` FK to **LocationTypes** (a table, not an enum), `barcode` of the form `LOC-<id>`.
- **SDS** — FK to **Container**, not Chemical (the same chemical from two manufacturers has two SDS documents). Stores a Drive file id, generated file name, revision date and number, and GHS pictograms. Several rows can share one Drive file. No update or delete.
- **CheckoutEvent** — audit log (container, user, action, timestamp); a check-in links to its check-out through `related_event`.
- **WeightReading** — balance history (container, weight, `recorded_at`, `recorded_by`); usage is derived from readings, never stored. There is no `source` field, so typed and measured weights are not distinguished.
- **LabelTemplate / LabelTemplateField** — the printer template registry (see Hardware).
- **BugReport / Feedback** — in `apps/feedback`.

CheckoutEvent and WeightReading are meant to be append-only, but this is not enforced yet: `WeightReadingView` is a full `ModelViewSet` and both timestamps use `auto_now=True`.

### API schema and frontend types

The frontend's API types are generated from the backend: drf-spectacular builds `backend/openapi.json` from the serializers and views, and openapi-typescript turns that into `frontend/src/types/api.ts`. drf-spectacular can't run a view; it infers each shape, and where it can't, it guesses (usually `string`) or uses the wrong serializer. **Any backend change that adds or changes what an endpoint accepts or returns must keep the schema exact.** In particular:

- **`SerializerMethodField` / computed fields:** give every `get_<field>` method a return-type hint (`-> str`, `-> bool`) or `@extend_schema_field(...)`, e.g. `@extend_schema_field(SDSSerializer(allow_null=True))` for an object that can be `None`, `SDSSerializer(many=True)` for a list. Model properties used through `ReadOnlyField` need a return-type hint.
- **A response that isn't the request serializer:** a custom `@action`, or a `create`/`update` that responds with a different serializer than it validates with, needs `@extend_schema(request=..., responses=...)`. Inherited actions (`create`, `update`, `partial_update`, `destroy`) are annotated from the class with `@extend_schema_view(...)`. Include non-2xx shapes the view returns (400, 409).
- **Bodies built by hand** (`Response({...})`, or `request.data` read directly): describe them with `inline_serializer(name=..., fields=...)`. Reuse `ERROR_DETAIL` and `STORAGE_CONFLICT` from `apps/inventory/schema.py`; define a shape used twice once, at module level (two `inline_serializer`s with the same name conflict).
- **A `list` action that returns one object** is treated as an array; see `DashboardView`'s `_SingleObjectSchema`.

Existing examples: `ContainerSerializer`'s `get_*` methods, `ChemicalView` and `ContainerView` in `apps/inventory/views/`.

Then, in the same change:

1. `poetry run pytest tests/test_schema.py` (in `backend/`) must pass. It runs drf-spectacular with `--fail-on-warn`, so any guessed type fails it.
2. Regenerate with `./scripts/generate-api-types.sh` (the pre-commit hook does this) and commit `openapi.json` and `api.ts` with the change. CI's `API types` check fails if they're out of date.
3. Run `pnpm exec tsc -b` in `frontend/`. Fix what it flags rather than loosening types; a new `| null` usually means a real missing null check.
4. In `frontend/src/types/index.ts`, use the generated type (`components['schemas']['X']`). Don't hand-write or `Omit`-patch a type the schema should describe; fix the backend annotation instead. The one deliberate exception is `Location`, whose recursive `children` is built in `to_representation`.

### Linting / formatting

All Python services use **Ruff** with `line-length = 100`. Migrations are excluded from Ruff checks. Frontend uses ESLint + Prettier; `format:check` and `lint` both run in CI.

## Project context
The MVP for this project is the Capstone Project for a year long Full-Stack Development course. The MVP should be completed by the user with no code completion provided by LLMs, to show they have learned the skills needed for a junior developer. LLMs may be used for tasks such as; syntax confirmation, brainstorming, and basic explanations. Once the MVP has been achieved and the course instructor has signed off, LLMs may then be fully utilized. When in doubt, behave as an instructor providing guidance towards an answer rather than the answer itself. 

MVP has been achieved and full LLM usage is now allowed. 

### Current state

The MVP (Milestone 1, Inventory + Locations) was signed off on 7 July 2026. Since then Milestone 2 (labels, barcodes, scanning) and Milestone 4 (balance) have largely been built, along with SDS upload to Drive, roles, storage-conflict warnings and bug reporting. Not started: Milestone 3 (waste), 5 (lab information and scheduling), 6 (personnel and forms). The roadmap is in [docs/Lab-Manager-App-Project-Plan.md](docs/Lab-Manager-App-Project-Plan.md).

[docs/Post-MVP-Code-Review.md](docs/Post-MVP-Code-Review.md) reviews everything added since sign-off and lists known problems in its section 2. Read the relevant category there before changing that area. Findings 1 to 5, 7 and 8 are fixed. The largest open ones: the bridge has no authentication (6), and a new mixture's storage category is lost (9). List endpoints that serialize containers should use `Container.objects.for_display()`, and `tests/test_list_query_counts.py` guards their query counts.

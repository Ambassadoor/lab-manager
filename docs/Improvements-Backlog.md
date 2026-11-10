# Improvements backlog

Changes noticed while walking through the code after v1.4.0. Planned work goes first, in
priority order; ideas that need decisions before they're actionable go last. Remove an item when
its PR merges.

## 1. "Recently added" by when a container was added

- "Recently added" sorts by `date_received`, which is typed in by hand (and can be mistyped, as
  chem-1174's was). It should use `created_at`, which records when the container was actually
  added (#155).
- **Two places use it:**
  - The Dashboard's "Recently added" card:
    [views/dashboard.py](../backend/apps/inventory/views/dashboard.py) orders by
    `-date_received`.
  - The Inventory page's `?view=recently_added`:
    [Inventory.tsx](../frontend/src/components/inventory/Inventory.tsx) requests
    `ordering=-date_received` and drops containers without a `date_received`.
- **What it needs:**
  - `created_at` added to `ContainerSerializer` (read-only) and to the container list's
    ordering fields.
  - The card's date shows when it was added, not received.
- **Containers without a `created_at`** (607 locally: no weigh-in to backfill from) sort last.
  Fall back to `date_received` for them (`Coalesce`), or leave them out.

## 2. Container fields: decide what's required, and drop `barcode`

Most of `Container`'s fields are `null=True, blank=True`. That was so the data migrated from Notion
would load whatever was missing. With the migration done and the app live, each field should say
whether it's really optional.

- **Drop `Container.barcode`.** Nothing reads or writes it, it isn't in the API, and it's empty
  for all 1,131 containers locally. It dates from the old UUID labels; printed labels carry
  `Container.label`. Check the live database is empty too, then remove it with a migration.
  `Location.barcode` *is* used; keep it.
- **Text fields: one kind of empty.** `manufacturer` and `product_num` are
  `CharField(null=True)`, so "empty" can be `NULL` or `""`. Django's convention is `""` only:
  convert the `NULL`s with a data migration, then drop `null=True`.
- **Decide required vs optional, field by field.** Empty values locally (check live on the test
  site first):

  | Field | Empty | Notes |
  |---|---|---|
  | `manufacturer` | 28 | The new-container form already requires it |
  | `product_num` | 43 | Form requires it |
  | `initial_quantity` / `quantity_unit` | 24 / 23 | Form requires them; needed for percent remaining |
  | `date_received` | 210 | Form requires it; defaults to today |
  | `initial_weight` | 679 | Form requires it; it's the first weigh-in |
  | `tare_weight` | 680 | Form requires it; Check In can fill it later |
  | `density` | 1,026 | Only for volumes; stays optional |
  | `date_opened`, `expiration_date` | 1,086 / 1,131 | Optional by nature |

  Several fields are required by the form but optional in the model, so the older rows are the
  ones that are empty. Making a field required in the model (`null=False`) needs every existing
  row to have a value first. For each one, choose:
  - **Backfill** (a data migration with a sensible value, if one exists).
  - **Leave optional** and keep relying on the form. The report builder (to-do lists) is a good
    way to find and fix the old rows by hand.
  - **Required in the API but nullable in the database:** `required=True` on the write
    serializer, so new data must have it while old rows can stay empty.
- **Keep the serializers, the form's rules and the docs** (CLAUDE.md's data model) in line with
  whatever is decided.

## 3. `deploy.sh` hangs at "Installing backend and bridge dependencies"

- The v1.5.1 deploy over SSH hung at `poetry install` although nothing needed installing.
- **Cause:** Poetry asks the system keyring (Secret Service) for credentials, even for public
  PyPI packages. The Pi's desktop keyring is locked, so it waits for an unlock prompt that shows
  on the Pi's own screen, not in the SSH session.
- **Workaround until fixed:** run the deploy with the keyring turned off:
  `PYTHON_KEYRING_BACKEND=keyring.backends.null.Keyring deploy.sh <tag>`.
- **Fix:** in [deploy.sh](../deploy/pi/deploy.sh), next to `unset VIRTUAL_ENV`, add
  `export PYTHON_KEYRING_BACKEND=keyring.backends.null.Keyring`, with a comment saying why. Every
  package comes from public PyPI, so Poetry never needs stored credentials here.
- Mention it under deploying updates in [deploy/pi/README.md](../deploy/pi/README.md), in case a
  manual `poetry install` on the Pi hangs the same way.

## Ideas (not actionable yet)

### Camera: smaller preview

- Replace the full-screen dialog with a docked panel, so the Actions list stays visible as scans
  are added.
- It would need to be non-modal for the list to stay usable.
- It might need to decode only the aiming area, so codes outside the visible preview aren't read.
- Keep full screen for single scans.

### Container QR codes as URLs

- Labels would encode a URL (e.g. `https://app.cplabmanager.com/c/CHEM-0292`) in place of
  `{"id":"CHEM-0292"}`, so a phone's own camera opens the container's SDS.
- **What it involves:**
  - A public `/c/:label` page that finds the container's SDS through the existing public
    `GET /api/inventory/sds/?container=<id>`, or says "No SDS on file". Don't point at
    `/sds/:id`, which changes when a container's SDS is replaced.
  - `identify()` accepts the URL as well as the JSON and bare ids, so old labels keep working.
  - The print payload changes. Test-print on the narrowest tape, since a longer payload makes a
    denser QR code.
  - Check In offers to print a new label when it sees the old format.
- **Decisions needed:**
  - **Reach:** the domain resolves to a private campus IP, so phones off campus or on cellular
    data can't open it.
  - **Location labels:** whether they change too.

### Microsoft sign-in and a My Apps tile

- The university uses Microsoft Entra ID; its My Apps portal is where the tile would appear.
- **A bookmark tile** is only a link, and almost no work for IT.
- **An SSO app** has three parts:
  - IT registers the app in the university's Entra tenant (OIDC) and assigns which users or
    groups can see it.
  - Django adds Microsoft login (e.g. django-allauth's Microsoft provider).
  - Open registration goes away; a local admin login stays as a fallback.
- **Ask IT** whether the sign-in token can include the Lipscomb ID. If it can, `User.lipscomb_id`
  fills itself in, and Check Out's holder lookup matches more people.
- A tile doesn't change who can reach the app: it's still campus only.

# Lab Manager Application — Project Plan

**Author:** Caleb (Lab Manager)
**Date:** May 20, 2026
**Status:** In use. Milestone 1 (MVP) signed off July 7, 2026; live on a Raspberry Pi in the stockroom since September 30, 2026. Milestones 2 and 4 are largely built. See [Section 4](#4-roadmap--milestones).
**Last reconciled with the code:** October 1, 2026
**Document purpose:** Define the project clearly enough that any future developer or lab manager can understand what is being built, why, and in what order.

> **How to read this document.** It is the original plan from May 2026, and the reasoning in it still stands. Where the build went a different way, an **As built** note says so and the original text is left in place. For how the code works today, read [CLAUDE.md](../CLAUDE.md) and the [Post-MVP Code Review](Post-MVP-Code-Review.md).

---

## 1. Overview & Purpose

The Lab Manager Application is an internal tool for managing the chemistry/lab operations of a small university. It exists to wrap a proper inventory database in the workflow and hardware that the current Notion database cannot reach — reading a balance over USB, driving label printers, and processing barcode scans.

A core requirement is **continuity**: the application must be maintainable by whoever holds the Lab Manager role after the original author. Every major decision in this plan favors boring, well-documented technology and clear documentation over cleverness.

This is not really one application — it is closer to eight applications sharing a database. Recognizing that is the most important planning decision: success depends on **sequencing**, not on any individual feature.

---

## 2. Users & Roles

| User type | Who | Primary use |
|-----------|-----|-------------|
| Lab Manager | The author and successors | Full use of every feature; primary administrator |
| Stockroom workers | One or two staff | Mostly updating inventory information |
| Other users | Faculty / instructors | Light, occasional use — calendar and scheduling features |

Three application roles are proposed:

- **Lab manager** — full access, including personnel data and configuration.
- **Stockroom** — inventory, waste, labels, and scanning; no personnel access.
- **Viewer** — read-only access plus calendar/scheduling.

> **As built:** six roles in four ranks. Admin and Lab Manager share the top rank, Coordinator and Faculty the next, then Stockroom Worker, then Lab Assistant (read-only, the default for a new account). The full matrix is in [Roles_and_Permissions.md](Roles_and_Permissions.md).

---

## 3. Scope

### 3.1 Full feature vision

The complete application is intended to cover eight feature areas:

1. **Inventory Management** — full CRUD of chemical inventory: chemical information, storage location, SDS, usage tracking via USB balance, check-out/in process.
2. **Chemical Waste Management** — creating waste containers, tracking contents, tracking status (in use, in storage, picked up, etc.).
3. **Label Making** — chemical labels via the Brother label maker SDK, waste labels via an Excel file for a Brady printer, and storage-location labels.
4. **Barcode / QR Scanning** — Bluetooth barcode scanner and phone-camera scanning for quick updates (location, weights, adding chemicals to waste containers, check-in/out).
5. **Lab Information** — labs offered, experimental procedures, prep instructions, estimated chemical usage.
6. **Scheduling** — users auto-generate calendar entries for labs they are involved in, with links to syllabi, prep instructions, and procedures.
7. **Personnel Manager** — personnel data, hire dates, positions, pay, contact info (mostly student workers); information on open positions.
8. **Forms** — custom in-app forms, or management of existing Google Forms.

### 3.2 MVP definition (Version 1)

The MVP is **Inventory Management, minus the hardware** — a fully usable inventory system that replaces the Notion database.

**In scope for v1:**

- Chemical records with full CRUD.
- Storage locations as a first-class, hierarchical entity.
- SDS as linked or attached files.
- Manual check-in / check-out.
- Manual quantity / weight updates.
- Search and filtering.
- A one-time migration script from the existing Notion database.

**Deliberately out of v1, but designed into the schema:**

- USB balance usage tracking — the app is fully usable with manual weight entry, so the balance should not gate v1. The schema still includes a weight-history table from day one.
- Barcodes — the schema includes a `barcode` field on chemicals/containers and locations from day one.
- Label making.

**Rationale for the boundary:** Barcoding only delivers value once items have scannable labels, and labels only print once the printer integration works. So *labels + barcode fields + scanning* are naturally one bundle, not three separate features — and that bundle is Milestone 2, not part of the MVP. Deferring a *feature* is cheap; deferring a *schema decision* causes a painful rewrite, so the schema anticipates everything.

---

## 4. Roadmap & Milestones

The guiding principle: **inventory is the spine**, and almost everything else hangs off it. Waste containers hold chemicals; labels are printed for chemicals, waste, and locations; barcodes scan chemicals and locations; lab info estimates chemical usage. Build the spine first and every later feature is an addition rather than a rewrite.

| # | Milestone | Depends on | Notes | Status (Oct 1, 2026) |
|---|-----------|-----------|-------|----------------------|
| 0 | **Spikes / de-risking** | — | Mostly complete — see below | Done, except phone-camera scanning and the Brady workflow |
| 1 | **MVP: Inventory + Locations** | 0 | Deployed and replacing Notion | Built, signed off July 7 and deployed September 30. The cut-over from Notion had not been scheduled as of that date, so the "Notion is no longer opened" test in Section 9 is not yet met |
| 2 | **Labels + Barcodes + Scanning** | 1 | Delivered together; they only deliver value as a bundle | Largely built: container and location labels, Bluetooth scanning for check-out, check-in, transfer and move. Phone-camera scanning is not built |
| 3 | **Chemical Waste Management** | 1 | Waste containers reference chemicals | Not started |
| 4 | **USB-balance usage tracking** | 1, 2 | Scanning helps identify which container is on the balance | Largely built: balance read and tare, weigh-in on check-in, percent remaining |
| 5 | **Lab Information + Scheduling** | 1 | Built together; scheduling links to lab info | Not started |
| 6 | **Personnel Manager + Forms** | 1 | Last — sensitive data, lowest workflow urgency | Not started |

Also built, outside the original milestones: SDS upload to Google Drive with a public SDS viewer, storage-conflict warnings based on the Flinn storage pattern, in-app bug reports sent to GitHub, and nightly database backups.

### Milestone 0 status

The riskiest hardware integrations have already been proven:

- **USB balance** — tested, working.
- **Brother label maker via SDK** — tested, working.
- **Bluetooth barcode scanner** — tested, working.

Remaining milestone-0 work is small:

- Confirm **phone-camera scanning** in a browser (a JS barcode library plus `getUserMedia`). This is the one untested hardware path.
- Confirm the **Brady waste-label workflow** — generate the Excel file in the format the Brady software expects and print one label.
- Note for the balance: confirm whether it streams weight continuously or requires a poll command, and record its serial protocol. (If this was established during testing, document it.)
- Note for the Brother printer: confirm the exact model and that the chosen SDK path matches it; record the SDK version used.

> **As built:**
> - **Balance:** an Adam CKT8UH over RS-232 through a USB-to-serial cable. It prints a reading every couple of seconds and also answers a `P` command with a full report; the bridge uses the command. The protocol is recorded in [bridge/README.md](../bridge/README.md) and `bridge/app/balance.py`.
> - **Brother printer:** a PT-P950NW. The SDK (b-PAC) is Windows-only, so it was dropped in favour of the printer's own P-touch Template commands, which work from Linux. See [bridge/PRINTER_PLAN.md](../bridge/PRINTER_PLAN.md).
> - **Phone-camera scanning** and the **Brady workflow** are still unproven.

### Definition of "shippable" per milestone

Each milestone must be **deployed and in real use** before the next begins. "Deployed and used" matters far more than "feature complete." Write acceptance criteria *before* starting each milestone.

---

## 5. Architecture

### 5.1 Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (single-page app) |
| Backend API | Django + Django REST Framework |
| Database | PostgreSQL |
| Local hardware bridge | Small Python service (FastAPI or Flask) on the lab PC |
| Waste labels | Excel file generated server-side with `openpyxl`, consumed by Brady software |
| Barcode/QR (camera) | JS barcode library in the React app |

This stack is deliberately mainstream and well-documented to satisfy the continuity requirement.

### 5.2 Shape of the system

A single React app is the entire user interface, used identically on a desktop browser and on a phone. A Django + DRF backend serves the API and owns the PostgreSQL database.

Hardware that is bound to the lab PC — the USB balance and the Brother label printer — is handled by a **local hardware bridge**: a small Python service running on that PC. Since the project is a Python shop, the bridge stays in Python: `pyserial` (or the relevant library) for the balance, and the Brother SDK for label printing. The React app calls the bridge at `http://localhost:<port>`.

Browsers treat `localhost` as a secure context, so an HTTPS-served React app can call `http://localhost` without mixed-content errors — this is what makes the bridge pattern work cleanly.

The **Bluetooth barcode scanner** behaves as an HID keyboard — it simply "types" the scanned value — so it requires no integration and works in any input field.

The **Brady printer** requires no integration: Django generates an `.xlsx` file and the user feeds it to Brady's own software.

> **As built:** everything runs on one Raspberry Pi in the stockroom, not on a hosted server plus the lab PC. nginx serves the React app, the Django API and the bridge from one address; the balance and the printer are plugged into the Pi by USB.
> - The bridge is reached at `/bridge/` on the Pi from any browser on the network, not at `http://localhost` on the machine next to the hardware. A consequence: weighing from another room reads whatever is on the stockroom balance.
> - The bridge does not use the Brother SDK. It sends P-touch Template commands over USB (or a network socket).
> - The site is served over HTTPS at `https://app.cplabmanager.com` (since October 1, 2026), and the bridge is on that same origin, so the `localhost` secure-context point above is not needed.
> - The Brady `.xlsx` export is not built (Milestone 3).
>
> Details are in the [deployment plan](Lab%20Manager%20on%20a%20Raspberry%20Pi%20—%20Deployment%20Plan.md) and `deploy/pi/`. The bridge can still run on a Windows lab PC with the printer on the network; see [bridge/README.md](../bridge/README.md).

### 5.3 Critical constraint — HTTPS for camera scanning

Browser camera access only works in a **secure context**. Only `localhost` is exempt. Therefore, phone-camera scanning requires the application to be served over real TLS — a proper hostname and a valid certificate. This is an IT decision and must be resolved before Milestone 2 (see Section 6). Do not architect the camera feature until TLS availability is confirmed.

> **As built:** resolved on October 1, 2026, without IT. IT gave the Pi a reserved IP address but no hostname, so Milestone 2 went ahead over HTTP with the Bluetooth scanner only. The app now has its own domain and a Let's Encrypt certificate (see [deploy/pi/README.md](../deploy/pi/README.md#https)), so TLS no longer blocks camera scanning. What remains unconfirmed for that feature is whether phones on campus Wi-Fi can reach the Pi.

---

## 6. Open Questions & IT Dependencies

Hosting is unresolved and depends on what university IT permits. Before architecture can be finalized, the following must be answered by IT:

- Can IT host a Linux VM for the application, or should it run on a lab-owned machine?
- Can the application get a **DNS hostname and a TLS certificate** (Let's Encrypt or an internal CA)? — phone-camera scanning depends on this.
- Will the application be reachable from phones on campus Wi-Fi, or is there a firewall in the way?
- Does IT require integration with **university SSO** (SAML / Shibboleth / Entra), or are standalone accounts acceptable for a handful of users?
- Who owns and runs **database backups**?
- The personnel module will store student-worker pay and contact information — are there **data-handling or privacy rules** that must be followed?

**Recommendation:** put the source code in a **university-owned git repository**, not a personal account, to protect continuity.

> **Where these stand (Oct 1, 2026):**
> - **Hosting:** a lab-owned Raspberry Pi on the stockroom's wired network, approved by IT as a personal device. An interim setup; a more official one may follow.
> - **Hostname and TLS:** nothing from IT. The project has its own domain instead: the app is at `https://app.cplabmanager.com`, which resolves to the Pi's reserved campus IP, with a Let's Encrypt certificate.
> - **Reachability:** lab computers reach the Pi on the campus network. Whether phones on campus Wi-Fi can has not been recorded. IT blocks the Pi from reaching the printer over the network, which is why the printer is on USB.
> - **SSO:** not integrated. Standalone accounts, restricted to Lipscomb email addresses.
> - **Backups:** owned by the app. A nightly dump is kept on the Pi and copied to Google Drive, 14 days of each.
> - **Privacy rules for personnel data:** open. Milestone 6 has not started.
> - **Repository:** still in a personal GitHub account.

---

## 7. Data Model

The data model is the highest-leverage planning artifact for this project, because inventory is the spine. Two structural decisions are locked:

- **Two-level inventory:** a `Chemical` is the *definition*; a `Container` is the *physical bottle*. This is required for per-bottle labels, balance-based usage tracking, and per-bottle check-in/out.
- **Hierarchical locations:** locations nest via a self-referencing parent (Building > Room > Cabinet > Shelf).

### 7.1 MVP entities

**Location** — self-referencing tree.

- `name`
- `location_type` — building / room / cabinet / shelf / fridge / etc.
- `parent` — FK to Location (nullable for the root)
- `barcode`
- `notes`

A plain parent FK is sufficient for a dataset this small; consider `django-mptt` only if subtree queries become slow.

**Chemical** — the definition / catalog entry.

- `name`, synonyms
- `cas_number`
- `manufacturer`, `catalog_number`
- `physical_state`
- GHS hazard classes
- `default_unit`
- `notes`

**SDS** — safety data sheet.

- `file` (upload) or `url`
- `revision_date`, `version`
- FK to Chemical (one-to-many, so superseded versions are retained)

**Container** — the physical bottle / instance.

- FK to Chemical
- FK to Location
- `barcode` (unique)
- `status` — in storage / in use / checked out / empty / disposed
- `received_date`, `expiration_date`, `opened_date`
- `nominal_size`, `current_weight` or `current_quantity`, `tare_weight`, `unit`
- `lot_number`
- `current_holder` — FK to User (nullable)

**CheckoutEvent** — append-only history.

- FK to Container, FK to User
- `action` — out / in
- `timestamp`, `notes`

**WeightReading** — append-only history.

- FK to Container
- `weight`, `recorded_at`
- `source` — manual / balance
- FK to User

Usage is **derived** from the deltas between weight readings — never stored as a mutable number.

**User** — Django's built-in user plus a `role` field (lab manager / stockroom / viewer).

> **As built:** the two locked decisions held. The entities differ from the lists above in these ways:
> - **Location:** `location_type` is a foreign key to a `LocationTypes` table, so types can be added without a code change. There is no `notes` field. The barcode is `LOC-<id>`.
> - **Chemical:** manufacturer and catalog number moved to Container, since they describe a bottle. `physical_state`, GHS hazard classes, `default_unit` and `notes` were not built. Added: IUPAC name, formula, PubChem id, molecular weight, a storage category, and mixtures (an `Ingredient` table linking a mixture to its components).
> - **SDS:** belongs to a **Container**, not a Chemical, because the same chemical from two manufacturers has two different documents. The file is stored in Google Drive and the row keeps its Drive id. GHS pictograms are recorded here.
> - **Container:** there is no `status` or `current_holder` field. Checked-out state comes from the latest CheckoutEvent, and discarded from `date_discarded`. There is no `lot_number`. Current weight is not stored; it is the latest WeightReading.
> - **CheckoutEvent:** no `notes`. A check-in records which check-out it closes.
> - **WeightReading:** there is no `source` field, so a typed weight and a balance reading are not distinguished.
> - **User:** six roles (see Section 2).
> - **Added:** `ChemicalStorageCategories`, `LabelTemplate` and `LabelTemplateField` (which templates are on the label printer), `BugReport` and `Feedback`.
>
> The two histories are append-only by intent, but the API still allows a weight reading to be edited. That is finding 10 in the code review.

### 7.2 Future entities (not built in the MVP, but anticipated)

The schema above is designed so that later features are additions, not rewrites:

- **Waste management:** `WasteContainer` with `WasteItem` rows pointing at Chemicals.
- **Lab information:** `Lab`, `Procedure`, `PrepInstruction`, with estimated Chemical usage.
- **Scheduling:** `ScheduledEvent` referencing a `Lab`.
- **Personnel:** `Employee`, `Position`, `OpenPosition`.

### 7.3 Notion migration

The existing Notion database has a usable API and its current schema is effectively a first draft of the data model. Treat migration as its own task: write a re-runnable script, clean and validate the data during migration, and spot-check the result against Notion.

> **As built:** done with two scripts in `backend/scripts/onetime/`. `import_notion_data.py` was the original one-time import. `reconcile_notion_data.py` brings Postgres up to date with later Notion changes without wiping it.

---

## 8. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Hardware integration unknowns | **Reduced** — balance, Brother printer (P-touch Template, not the SDK), and scanner are all built and in use | Document the working configurations; only phone-camera scanning and the Brady/Excel workflow remain to prove |
| Abandonment / loss of momentum — large project built around a full-time job | High | Keep milestones small; each must reach real daily use; "deployed and used" beats "feature complete" |
| Continuity / bus factor — solo developer building something meant to outlive them | High | Boring, documented stack (done); university-owned git repo; write the README and setup steps as you go |
| IT dependency unresolved — hosting and TLS | Medium | Complete the IT conversation in Section 6 before Milestone 2; do not build the camera feature before TLS is confirmed |
| Personnel data sensitivity — pay and contact info | Medium | Deferred to last; restrict by role; confirm privacy rules with IT/HR; consider not duplicating pay data HR already holds |
| Notion migration data quality | Low–Medium | Treat migration as its own task; clean data during import; make the script re-runnable |
| Solo developer time constraints | Medium | Independently shippable milestones so progress survives interruptions |

---

## 9. Definition of Done

Write acceptance criteria **before** each milestone, not after.

### MVP (Milestone 1) — done when:

- Every chemical from the Notion database is migrated and spot-checked for accuracy.
- Chemicals and their containers can be added, edited, and searched.
- Storage locations exist as a working hierarchical tree.
- SDS files are attached to chemicals. *(As built: attached to containers; a chemical shows the SDS of its containers.)*
- Manual check-in / check-out works.
- The application is deployed and reachable at a real URL.
- **Notion is no longer opened for inventory.** When the old tool goes unused, the milestone has truly shipped.

### General principle

For every milestone, "done" means the feature is deployed, in real use, and the workflow it replaces has been retired.

---

## 10. Appendix — The Planning Method (Reusable)

This plan was produced by walking five stages, reusable for any future project:

1. **Problem & users** — what is being built, for whom, and under what constraints (here: the continuity requirement).
2. **Scope & MVP** — draw a hard line around the smallest useful version; find the dependency spine.
3. **Technical shape** — platform, stack, and the major architectural tension (here: desktop-bound hardware vs. a phone requirement).
4. **Structure & data model** — entities, relationships, and the modeling decisions made consciously.
5. **Risks & definition of done** — name what could derail the project, and define how you will know it is finished.

Cross-cutting habits: find the spine and build it first; de-risk unknowns with small throwaway spikes *before* committing to an architecture; and design the schema for the features you are deferring.

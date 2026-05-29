# Lab Manager Application — Project Plan

**Author:** Caleb (Lab Manager)
**Date:** May 20, 2026
**Status:** Planning — pre-development
**Document purpose:** Define the project clearly enough that any future developer or lab manager can understand what is being built, why, and in what order.

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

| # | Milestone | Depends on | Notes |
|---|-----------|-----------|-------|
| 0 | **Spikes / de-risking** | — | Mostly complete — see below |
| 1 | **MVP: Inventory + Locations** | 0 | Deployed and replacing Notion |
| 2 | **Labels + Barcodes + Scanning** | 1 | Delivered together; they only deliver value as a bundle |
| 3 | **Chemical Waste Management** | 1 | Waste containers reference chemicals |
| 4 | **USB-balance usage tracking** | 1, 2 | Scanning helps identify which container is on the balance |
| 5 | **Lab Information + Scheduling** | 1 | Built together; scheduling links to lab info |
| 6 | **Personnel Manager + Forms** | 1 | Last — sensitive data, lowest workflow urgency |

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

### 5.3 Critical constraint — HTTPS for camera scanning

Browser camera access only works in a **secure context**. Only `localhost` is exempt. Therefore, phone-camera scanning requires the application to be served over real TLS — a proper hostname and a valid certificate. This is an IT decision and must be resolved before Milestone 2 (see Section 6). Do not architect the camera feature until TLS availability is confirmed.

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

### 7.2 Future entities (not built in the MVP, but anticipated)

The schema above is designed so that later features are additions, not rewrites:

- **Waste management:** `WasteContainer` with `WasteItem` rows pointing at Chemicals.
- **Lab information:** `Lab`, `Procedure`, `PrepInstruction`, with estimated Chemical usage.
- **Scheduling:** `ScheduledEvent` referencing a `Lab`.
- **Personnel:** `Employee`, `Position`, `OpenPosition`.

### 7.3 Notion migration

The existing Notion database has a usable API and its current schema is effectively a first draft of the data model. Treat migration as its own task: write a re-runnable script, clean and validate the data during migration, and spot-check the result against Notion.

---

## 8. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Hardware integration unknowns | **Reduced** — balance, Brother SDK, and scanner are all tested and working | Document the working configurations; only phone-camera scanning and the Brady/Excel workflow remain to prove |
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
- SDS files are attached to chemicals.
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

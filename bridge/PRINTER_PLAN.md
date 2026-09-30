# Brother PT-P950NW integration — planning notes

Research/decision notes from a planning session, for picking this back up
later. Nothing here is implemented yet — `main.py`'s `/print/label` is
still the original stub.

## Decision: P-touch Template mode over network, not b-PAC

Two old reference projects exist (`~/playground/lclims`,
`~/projects/print-server`) that implemented this via the Brother b-PAC SDK
— a Windows-only COM library, driven from a spawned C# child process
(`print-server/bridge/Program.cs` + `BPacChildProcessAdapter.js`) because
an earlier `edge-js`-based in-process attempt had unstable COM marshalling.
That work is a useful reference (see below) but **we're not following that
architecture** — going with a different protocol instead of b-PAC.

**Why:** Brother's own developer docs (now in `brother_docs/`) show the
raster/P-touch Template protocol family works over plain network TCP/IP,
and is explicitly documented as intended for non-Windows use (*"When
printing from an operating system other than Windows (Example: When
printing from a Linux computer...)"* — Raster Command Reference,
"About Raster Commands"). That means:
- No Windows/COM/`pywin32` dependency — the bridge could run as plain
  cross-platform Python, not tied to a specific Windows machine.
- No spawned child process needed (unlike the old b-PAC approach).
- Status/media/supply queries are supported and more precise than what
  b-PAC gave the old project (see below) — this covers the "check media
  size, supply levels" feature the balance work's stockroom context also
  wants.

**P-touch Template mode specifically** (not raw raster mode): templates
are still designed visually in P-touch Editor and pre-loaded onto the
printer's own memory (same workflow as the existing `.lbx` templates —
`print-server/templates/ChemicalQRCodes.lbx` may be reusable as-is or as
a starting point). At print time you send a compact command referencing
the template + field data, instead of generating a full bitmap yourself.
Raw raster mode is the alternative if more layout control is ever needed,
but it means reimplementing text/barcode rendering in code (e.g. Pillow)
that P-touch Editor currently gives for free.

## Reference material

- `bridge/brother_docs/` — Brother's official developer docs, added this
  session:
  - `cv_ptp900_eng_ptemp_103.pdf` — P-touch Template Command Reference
    (the one we're building against)
  - `cv_ptp900_eng_raster_102.pdf` — Raster Command Reference (status
    query command lives here; P-touch Template mode is built on top of
    this same command family — see its own section 6.2)
  - `cv_ptp900_eng_escp_103.pdf` — ESC/P Command Reference (not chosen,
    kept for reference)
  - `Using Web Based Management _ Brother.pdf` — the printer's built-in
    HTTP(S) config page (`http://<printer_ip>/`). Good for manual network
    config/status checks, not a programmatic API (HTML forms, no JSON).
- `~/playground/lclims/BPAC_INTEGRATION.md` — thorough b-PAC API reference
  and architecture writeup. Not the path we're taking, but the "Sample Use
  Cases for LIMS" section's label field naming conventions are still a
  reasonable reference.
- `~/projects/print-server/` — old Node/Express print server. Its
  `IPrinterAdapter` interface and adapter pattern (`MockAdapter` for
  dev-without-hardware, real adapter for production) is a good shape to
  mirror even though the real adapter itself won't be b-PAC-based.
- Confirmed connection: the old label format (`Barcode1` QR =
  `{"id":"CHEM-1101","uuid":"..."}`) is the same shape `parseBarcode.ts`
  already parses from scanner input — so whatever template we print needs
  to keep producing that same QR payload shape for scanning to keep working.

## Known protocol details (from brother_docs, so next session doesn't need to re-search)

**Status request:** `ESC i S` (hex `1B 69 53`). Send once before printing
(not while printing — error info arrives automatically during printing).
Response is a fixed 32-byte structure. Relevant byte offsets:
- Offset 6: battery level
- Offset 8: error information 1 (bit flags — no media, end of media,
  cutter jam, weak batteries, high-voltage adapter)
- Offset 9: error information 2 (bit flags — replace media/wrong media,
  buffer full, communication error, cover open, overheating, system error)
- Offset 10: media width (mm)
- Offset 11: media type (laminated/non-laminated/fabric/etc.)
- Offset 17: media length (mm)
- Offset 18: status type / offsets 19-20: phase type + number

All fields above confirmed supported on PT-P950NW specifically in the
compatibility tables (not just the PT-P900 family generally).

**P-touch Template full command protocol (read in detail — this is
enough to implement against):**

Prerequisite (one-time, manual, per template): design the label in
P-touch Editor, name every field you'll set programmatically (e.g.
`Text1`, `Barcode1` — matches the old `ChemicalQRCodes.lbx` convention),
then use P-touch Editor's Transfer Manager to send it to the printer's
own memory, which assigns it a number 1–99. This step needs Windows +
P-touch Editor but is *not* a runtime dependency — once transferred, the
printer remembers it independently.

Print sequence (send as one stream of bytes over the socket):
1. `^TS0NN` — select template number NN, e.g. `^TS003` for template 3
   (`5Eh 54h 53h 30h 30h 33h`)
2. `^ID` — initialize template data (resets the *currently selected*
   template to its as-transferred state). Must come after `^TS`, not
   before — `^ID` operates on whatever template is currently selected at
   the moment it's sent, so sending it first just resets whatever
   template was left selected from a previous call, and the one just
   chosen via `^TS` never gets reset at all. (Caught in review — the
   original implementation had this backwards; didn't surface in testing
   since that test always populated every field the template had, which
   masks the bug. Only shows up with a partial `fields` dict, where the
   omitted field would silently retain stale data from a previous print.)
3. For each field: `^ON<name>\0<value><delimiter>` — select object by
   name (`^ON` + name + `00h` terminator), immediately followed by the
   field's text, ended by the delimiter (default `09h`/tab, configurable
   via `^SS`). E.g. selecting "TEXT1": `^ONTEXT1\0` = `5Eh 4Fh 4Eh 54h
   45h 58h 54h 31h 00h`.
4. `^FF` — trigger printing (only needed if the print-start trigger is
   the default "command text string" mode set via `^PT`; if `^PT2` — "all
   objects filled" — printing starts automatically once the last field's
   delimiter arrives).

Status query: `^SR` (`5Eh 53h 52h`, no parameters) — returns the *same*
32-byte structure as raster mode's `ESC i S` (see offsets above), so
there's one status-parsing implementation for both. Confirmed PT-P950NW
returns model code `70h` ("p") in this response specifically.

Also available: `^OS` selects an object by number instead of name (1-50,
alternative to `^ON`), `^CN` sets copy count, `^II` is a broader
initialize (vs. `^ID` which is template-data-only).

**Network transport:** raster doc's flow chart 5.6 confirms a plain
TCP/IP connection where "print data from the operating system's port
monitor is simply sent as is" — i.e. a raw socket, same data as the
USB/Bluetooth flows just over TCP. **No port number is documented in any
of the three command references** (ptemp, raster, escp all searched) —
they're transport-agnostic. Almost certainly the industry-standard
raw/JetDirect port 9100 used by this class of network printer, but this
needs to be confirmed empirically (just try connecting) rather than from
Brother's docs, since they don't state it.

## Network setup (confirmed)

Printer is connected to a wired Ethernet drop in the stockroom (not a
direct link to the computer — the stockroom computer is on WiFi, printer
is wired into the building network). From the printer's network status
page:

- IP Address: `10.113.50.17` (DHCP/`AUTO`, not static — ask network admin
  for a reservation on MAC `b4-22-00-e0-44-fc` so it doesn't drift later)
- Subnet: `255.255.0.0` (/16) — large institutional network, not a simple
  home-router setup
- Node name: `BRNB42200E044FC`
- Web Based Management: `http://10.113.50.17/`

**Confirmed:** the WiFi-to-wired firewall concern was real. The stockroom
computer **cannot** reach `10.113.50.17` over WiFi, but **can** reach it
once the computer itself is also wired into the network. Fix: wire the
stockroom computer into the second available Ethernet port (only one of
the two was used, for the printer) rather than relying on WiFi. Most OSes
prefer a wired connection over WiFi automatically once plugged in, so
this shouldn't require disabling WiFi manually.

**Implication:** wherever the bridge service actually runs long-term, it
needs to be on the wired network to reach the printer — same requirement
as the balance's USB port, just for a different reason (network
segmentation instead of WSL2's USB passthrough gap). Don't assume WiFi
is sufficient if the bridge ever moves to a different machine.

Wireless LAN, Wireless Direct, and Bluetooth are all enabled on the
printer but unused/irrelevant now that we're going wired network.

## Debugging log: getting the network connection working

Real sequence of issues hit getting `bridge/app/printer.py` talking to
the printer, in case any of this recurs:

1. **Printer was configured for LPR (port 515), not Raw (port 9100).**
   `GET /print/status` first returned "connection actively refused" on
   port 9100 — an *active* refusal (not a timeout) meant the network path
   itself was fine, something was just listening on the wrong protocol.
   Windows' "Add Printer → TCP/IP" wizard failing to detect a "Generic
   Network Card" device confirmed it. Found under the printer's Web Based
   Management → Network → Protocol settings: it was set to LPR, switched
   to Raw. LPR and Raw are genuinely different wire protocols (LPR wraps
   data in its own job-control handshake; Raw just streams bytes) — not
   interchangeable, and this fully explained the refusal.

2. **After switching to Raw, connection succeeds but `^SR` gets zero
   response.** Ruled out wrong command mode (confirmed P-touch Template
   mode both via the printer's own Settings Tool *and* by prepending an
   explicit `ESC i a` mode-select command before every request — no
   change). Ruled out "just needs more time" (tested standalone, outside
   the bridge, with a 20s timeout — still `TimeoutError`). Ruled out our
   bridge code specifically (same result from a raw isolated Python
   script with no FastAPI/printer.py involved).

3. **Root cause: status queries appear to not be supported over the
   network raw connection at all.** Compared the raster doc's flow charts
   directly — 5.1 (USB) explicitly shows a bidirectional "Status
   information request → Status (response)" exchange before printing
   starts; 5.6 (Network/Standard TCP/IP) shows *only* one-directional
   data flow (computer → printer, printer shows BUSY) with no status
   exchange anywhere in the diagram. This is Brother's own documentation,
   not a guess — the network raw port looks like it's designed as a dumb
   one-way pipe (matches generic OS print-spooler "port monitor"
   behavior), while the full bidirectional command protocol (including
   status) is a USB/Bluetooth-only feature.

**Consequence:** `printer.get_status()` likely cannot work as written
against the network connection, regardless of further tweaking — this
isn't a bug to keep chasing in `printer.py`. Printing itself should still
work fine over network raw (that's exactly what flow chart 5.6 shows
succeeding, and it doesn't require a response to know it worked). If
status/supply-level checking is still wanted, it needs a different
mechanism — candidates to explore later: scraping the Web Based
Management HTML status page (fragile, but known to work — see
`Using Web Based Management _ Brother.pdf`), or checking whether the
printer exposes SNMP (standard, actually built for this, worth checking
before assuming HTML scraping is the only option).

## Status as of this session

Implemented: `bridge/app/printer.py` (`get_status()`, `print_label()`),
wired into `main.py` as `GET /print/status` / `POST /print/label`,
`PRINTER_IP`/`PRINTER_PORT` in `.env`/`.env.example`, README updated.
Network connection to the printer (port 9100, Raw protocol) confirmed
working.

**`print_label` is fully verified against real hardware** — printed a
real label (QR code + text) using the pre-existing `ChemicalQRCodes.lbx`
template (already transferred to the printer, assigned template number
**1**, with object names **`Barcode1`** and **`Text1`** — confirmed via
P-touch Editor's Transfer Manager). Test request used
`{"template": 1, "fields": {"Barcode1": "...", "Text1": "..."}}` and
returned `{"printed": true}`, with a real label coming out of the
printer. Core feature works end-to-end.

**`get_status()` reimplemented over SNMP, replacing the raw-socket
attempt entirely.** Brother confirmed (via their own support material)
that OID `1.3.6.1.4.1.2435.3.3.9.1.6.1.0` returns the identical 32-byte
status structure as the ESC/P status command, over SNMP GET, on the
PT-P950NW specifically (it's in Brother's listed supported-models set).
Added `pysnmp` as a dependency (+ `pyasn1` transitively) and
`PRINTER_SNMP_COMMUNITY` (defaults to `public`) to `.env`/`.env.example`.
Same byte-offset parsing logic as before, just fetched differently —
`get_status()`/`/print/status` are now `async def` since pysnmp's
high-level API is asyncio-only, while `print_label`/`/print/label` stay
synchronous (raw socket I/O, unchanged).

One real bug caught before it ever reached real hardware: `SnmpDispatcher()`
needs a running asyncio event loop at construction time, but was
initially created at module level (which runs during plain import,
before uvicorn's event loop exists) — would have crashed the app on
startup. Fixed with lazy initialization (`_get_snmp_dispatcher()`,
created on first call inside `get_status()`, cached afterward). Caught by
actually running `from app.main import app` locally, not just by ruff —
worth doing that check after any change here given how easy this kind of
import-time-vs-runtime bug is to miss.

**Verified against real hardware — working.** `GET /print/status`
returned real data: `{"battery_level": 4, "media_width_mm": 12,
"media_length_mm": 0, "media_type": "laminated tape", "errors": []}`.
Confirms the byte-offset parsing, the media-type lookup table, and the
error-flag decoding are all correct — `media_width_mm: 12` matches the
documented TZe tape table (`0x0C` = 12mm), `media_length_mm: 0` is
correct since tape media always has a fixed-zero length field (only
cut-sheet media has a real one). Both bridge endpoints are now fully
implemented and confirmed working end-to-end.

## Cancelling a held/buffered print job — abandoned, both candidates failed

Explored this for the scenario where a print is attempted during an
error state (wrong media, etc.) and the printer holds the job rather
than discarding it — auto-resuming and printing a stale job once the
physical issue is resolved, unless explicitly cancelled first. Tried and
removed a `printer.cancel()` / `POST /print/cancel` implementation twice:

1. **`^II`** (P-touch Template's own "initialize" command) — documented
   wording ("all data already fed in... initialized") sounded like it
   should clear a held job. Tested: sent `^II` after an intentional
   error, got a normal response, resolved the error, and the original
   held job printed anyway. Didn't work.
2. **`ESC @`** (raster mode, switched into briefly since it's not in the
   P-touch Template command list) — the raster doc's own words are
   explicit: *"Also used to cancel printing."* More direct wording than
   `^II`, tried it anyway given how directly it discusses cancelling.
   Also tested, also didn't clear the held job.

Both looked like the right command based on documentation; neither
actually worked in practice. Same class of gap as the network
status-query issue earlier in this session — documented wording isn't a
reliable guide to actual behavior on this printer, only testing is.
Removed the dead code rather than leave an endpoint that claims
`{"cancelled": true}` without actually cancelling anything. If this
becomes a real operational problem later (not just a theoretical one —
confirm it's actually happening before spending more time here), worth
a fresh angle rather than a third guess at documented command wording:
possibly Web Based Management's job-queue view (if it has one), or
asking Brother support directly the same way the status OID was obtained.

## TODO — frontend/backend wiring (next session)

`/print/label` and `/print/status` are both implemented and confirmed
working against real hardware (see above). Nothing on the frontend or in
Django consumes them yet. In priority order:

1. **Printer status component.** Frontend component (bridge client
   functions already stubbed in `api/bridge.ts` per
   [types/index.ts](../frontend/src/types/index.ts)'s `PrinterStatus`
   type, not yet called anywhere) that lets a user quickly check
   online/offline, media installed, and current errors at a glance —
   surfaces `GET /print/status`. Somewhere globally visible (header/nav),
   not buried in one page, since printing happens from several places
   (chemical labels, location labels).
2. **Print result feedback everywhere printing happens.** Every UI entry
   point that calls `POST /print/label` needs to show success/fail/error
   to the user — not just log it. Reuse one presentation (toast/snackbar)
   rather than inventing a pattern per page. Bridge unreachable, printer
   offline, and printer-reported errors (from the `errors` array) are
   three distinct cases worth distinguishing in the message rather than
   a generic "print failed."
3. **Template registry (DB-backed, admin/manager-managed).** A Django
   model + admin UI so template number, object/field names (e.g.
   `Barcode1`, `Text1`), and media size (mm) are data, not hardcoded —
   see `print_label()`'s docstring in `app/printer.py` for why the
   bridge itself can only select-by-number, never introspect a
   template's fields from the printer.
   - **Needs a resolved design for "same content, multiple sizes":** a
     given label *kind* (e.g. Location) can map to more than one
     template number depending on installed media width — template 2 at
     12mm, template 3 at 24mm, etc., with the same field names. So the
     registry can't be a flat `kind → template #` map; it's closer to
     `kind → [{template #, media_width_mm, field mapping}]`, and the
     print flow needs to either compare `media_width_mm` from this table
     against `GET /print/status`'s live `media_width_mm` and pick the
     matching row (or reject/warn if none matches the loaded media), or
     let the user pick a size explicitly at print time. Decide which
     before building the model, since it affects the schema (one row per
     template vs. one row per label-kind with a nested size list).
   - **Media width choices:** the user guide's spec table (p.170,
     `cv_ptp950nw_useng_usr_04.pdf`) gives the fixed set of standard TZe/
     HGe tape widths this printer takes: **3.5, 6, 9, 12, 18, 24, 36 mm**
     (plus FLe/HSe specialty cassettes at their own fixed sizes). Use
     this as the enum/dropdown for `media_width_mm` rather than a free
     `int` field — matches `_MEDIA_TYPES`' style of a closed set in
     `printer.py`.
   - **No live read-back of a template's fields — confirmed again, but
     found a manual cross-check.** The guide's "Backing up Templates...
     Saved in the P-touch Label Printer" (p.118) confirms P-touch
     Transfer Manager *can* read back what's currently on the printer
     (name + key/template number, per item) via its `[Backup]` button —
     but this is a manual, Windows-only, GUI-triggered action against
     that specific software, not a protocol command; nothing our bridge
     can call. Useful as a periodic manual audit for whoever maintains
     the registry (confirm the DB rows still match reality after any
     P-touch Editor changes), not as an automation path.
   - **Template numbering constraint worth surfacing in the registry
     UI:** Transfer Manager auto-assigns key numbers 1–10 when you drag a
     template into a printer folder; going to 11–99 requires deliberately
     setting that in Transfer Manager's advanced options (p.116, p.71-72
     notes). Worth a hint in the admin form ("numbers above 10 must be
     set manually in P-touch Editor's Transfer Manager") so a manager
     doesn't create a registry row for a number that was never actually
     assigned that way.
4. **Whether printer errors can be cleared programmatically — resolved:
   no.** Checked all four Brother references now in `brother_docs/`
   (ptemp, raster, escp command references + this user guide); none
   documents a network/serial command that clears a latched error. This
   matches the "Cancelling a held/buffered print job" finding above
   (`^II`, `ESC @` — both tested, neither worked) — Brother's own
   troubleshooting table (p.169, "I want to reset an error") gives only
   a **manual, physical** sequence:
   1. Open the top cover, then close it.
   2. If not cleared, press the **Feed & Cut** button.
   3. If still not cleared, power the printer off and back on.
   4. If still not cleared, contact Brother support (likely hardware
      fault).
   Same page also confirms **cancelling an in-progress job is manual
   too** — briefly press the **Power** button — consistent with why the
   two programmatic cancel attempts above never worked; there may simply
   be no network/serial-reachable command for either action on this
   model. **Action:** the status component from item 1 should show this
   4-step sequence verbatim whenever `errors` is non-empty, so a
   stockroom worker isn't left stuck with no next step.
5. `CLAUDE.md`'s repo-level line still mentions b-PAC/`pywin32` for the
   printer — worth a follow-up edit now that the actual approach (raw
   socket + SNMP, no Windows/COM dependency) is settled and working.

## FYI: barcode-scanned commands directly to the printer (not planned — different architecture)

`cv_ptp950nw_useng_usr_04.pdf` chapter 6 ("Connecting a Barcode Scanner",
p.70) and chapter 22 ("List of Barcodes for the P-touch Template
Function", p.185) document a **standalone** P-touch Template workflow:
a barcode scanner plugged directly into the printer itself (USB host,
RS-232C serial, or Bluetooth — **not** through a computer/network at
all) scans a sequence of pre-printed "command" barcodes to select a
template, fill its fields, and trigger printing, with zero computer
involvement at print time. Brother even sells a barcode scanner
pre-configured for this (PA-BR-001, ch. 25).

The command barcodes encode the exact same P-touch Template protocol
`printer.py` already speaks over the network socket (`^TS`, `^ID`,
`^ON`/`^OS`, `^FF`, `^NN`, etc. — see ch. 22's table) — scanning a
barcode just injects those bytes at the printer's serial/USB-host port
instead of us writing them to a TCP socket. Chapter 6 also documents a
"Database Lookup Printing" mode (p.76) where a `.csv` transferred onto
the printer alongside a template lets a scanned keyword barcode look up
a row and fill the template natively — conceptually similar to what our
Django backend already does when it builds the `fields` dict for
`POST /print/label`, just done printer-side instead.

**Not adopting this** — our web app already covers the same ground more
usefully (real inventory data instead of a static onboard CSV, audit
logging, no pre-printed command-barcode sheets to keep track of). Noting
it here because it's a legitimate **offline fallback**: if the bridge or
network is down, someone could still walk up to the printer with a
printed sheet of these command barcodes and a scanner plugged directly
into it and print a label with no computer at all. Worth revisiting only
if that scenario becomes a real operational pain point — not before.

## Resolved this session
- ~~Test `POST /print/label` for real~~ — done, printed successfully
  using the pre-existing `ChemicalQRCodes.lbx` (template 1, fields
  `Barcode1`/`Text1`).
- ~~Decide what to do about `/print/status`~~ — reimplemented over SNMP
  rather than dropped, verified working against real hardware.

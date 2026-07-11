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

## Open questions for next session

1. Frontend wiring (bridge client functions in `api/bridge.ts`, UI
   buttons) — not started yet. Both bridge endpoints are confirmed
   working, so this is unblocked whenever it's picked up.
2. `CLAUDE.md`'s repo-level line still mentions b-PAC/`pywin32` for the
   printer — worth a follow-up edit now that the actual approach (raw
   socket + SNMP, no Windows/COM dependency) is settled and working.

## Resolved this session
- ~~Test `POST /print/label` for real~~ — done, printed successfully
  using the pre-existing `ChemicalQRCodes.lbx` (template 1, fields
  `Barcode1`/`Text1`).
- ~~Decide what to do about `/print/status`~~ — reimplemented over SNMP
  rather than dropped, verified working against real hardware.

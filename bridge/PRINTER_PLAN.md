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
1. `^ID` — initialize template data (clean slate)
2. `^TS0NN` — select template number NN, e.g. `^TS003` for template 3
   (`5Eh 54h 53h 30h 30h 33h`)
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

## Open questions for next session

1. Confirm the actual TCP port for raw network printing (check printer's
   Web Based Management page, or the escp/ptemp docs' network sections
   which weren't searched yet).
2. Read the P-touch Template "Control Command Details" section in full
   (page ~34 onward) to get exact command byte sequences and the
   delimiter-based field data format for `^TS`/`^SS`.
3. Decide whether to reuse `print-server/templates/ChemicalQRCodes.lbx`
   as-is, or design fresh templates — and how to transfer a template onto
   the printer's memory (P-touch Editor's transfer tool, referenced in
   `BPAC_INTEGRATION.md` and the ptemp doc's "Transferring templates"
   section).
4. Design the bridge-side interface: likely fill in the existing
   `POST /print/label` stub, plus probably a new `GET /print/status`
   endpoint for the media/supply-level feature — mirroring the
   `containerKeys`-style query-key/endpoint pattern already used for the
   balance on the frontend side.
5. Pick a Python networking approach (stdlib `socket` is probably enough
   for a raw TCP send + read-response, given the balance code already
   shows the pattern of a small synchronous I/O module called from a
   sync FastAPI route).

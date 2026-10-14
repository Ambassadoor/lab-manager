# Improvements backlog

Changes noticed while walking through the code after v1.4.0, in priority order. The first three
sections are planned work; the last is ideas that need decisions before they're actionable.
Remove an item when its PR merges.

## 1. Tare and density

One PR, in this order: each step leaves shared pieces for the next.

### 1.1 Density and quantity on the container detail and edit pages

- [ContainerDetail.tsx](../frontend/src/components/inventory/ContainerDetail.tsx) doesn't show
  density, and [ContainerEditForm.tsx](../frontend/src/components/inventory/ContainerEditForm.tsx)
  has neither density nor quantity.
- Add both. Density (g/mL) only matters for volume units, so show it for those.
- Editing either changes that container's `percent_remaining`. That's expected, but say so in the PR.

### 1.2 Check In: fill in missing quantity or density

- Today, when `contentMassGrams(container)` is null, the estimate button in
  [TareField.tsx](../frontend/src/components/inventory/TareField.tsx) is disabled with a tooltip:
  "Needs the container's quantity and density".
- Show the missing inputs inline instead:
  - quantity and unit, if there's no quantity
  - density, if the unit is a volume
- Use the typed values for the estimate straight away.
- **Saving:** PATCH the container through the existing endpoint (Stockroom and up) before
  `weigh_in_bulk`. That needs no API change.

### 1.3 New container form: tare estimate for a part-used bottle

- [ContainerForm.tsx](../frontend/src/components/inventory/ContainerForm.tsx)'s tare effect assumes
  a full bottle: tare = initial weight − full contents.
- Add the same "% left" estimate that Check In has, for bottles entered part-used. Reuse `TareField`
  if it fits, or else `estimateTare` and `contentMassGrams` from
  [shared/units.ts](../frontend/src/components/shared/units.ts).
- Switch the effect's own unit conversion to the `units.ts` helpers, so there's one copy.

### 1.4 TareField layout

- When "% left" opens, the tare field shrinks to `minWidth: 130`, and its calculator button
  crowds the label and value.
- Possible fixes:
  - a larger minimum width
  - letting "% left" wrap onto its own line on narrow screens
  - moving the button outside the input
- Check the result at phone width, and with several rows on Check In.

## 2. Camera scanner

### 2.1 Bug: the camera stays on if closed while starting

- In [CameraScanner.tsx](../frontend/src/scanner/CameraScanner.tsx)'s start effect: if the scanner
  unmounts while `getUserMedia` is still pending, cleanup runs with `stream === null`.
- The stream then arrives, `if (stopped || !video) return` exits, and its tracks are never stopped.
- When it happens:
  - in production, closing the camera before answering the permission prompt
  - in development, every time, because of StrictMode's double mount
- **Fix:** stop the tracks in that early return.
- **Check:** open the camera and close it immediately; the camera light should go off.

### 2.2 Code 39 barcodes (ID cards)

- Lipscomb ID cards carry a Code 39 barcode. The Bluetooth scanner reads them on Check Out; the
  camera only reads QR codes (`formats: ['qr_code']` in
  [detector.ts](../frontend/src/scanner/detector.ts)).
- Add `code_39`:
  - **Native detector:** check it with `getSupportedFormats()`, as is done for QR.
  - **zxing:** pass it to the decoder as well.
- Scans then reach `lipscombIdFrom` the same way the scanner's do.
- **Cost:** each extra format slows decoding with zxing, which matters most on iPhones. Ideally,
  enable Code 39 only while a handler wants ID cards (Check Out), not app-wide.
- **Aiming box:** 1D codes are easier to line up in a wide, short box.
- **Test** a real card on an iPhone and an Android phone.

## 3. SDS loading and scan labels

### 3.1 SDS viewer loading state

- [SdsViewer.tsx](../frontend/src/components/sds/SdsViewer.tsx) shows nothing while the SDS record
  loads, then a blank frame until Drive's viewer appears.
- Overlay a skeleton on the iframe until its `onLoad` fires. Put `key={sds.drive_id}` on the
  wrapper so the skeleton resets when the document changes.
- Show a skeleton in place of `return null` while the record loads.
- **Optional:** after about 10 s with no load, show an "Open in Drive" link.
- `onLoad` means Drive's viewer page has loaded, not that the PDF has drawn. Drive shows its own
  spinner after that.

### 3.2 Scan labels shown unpadded

- [identify.ts](../frontend/src/scanner/identify.ts) builds its label as `CHEM-${n}`, so scan lists
  and the camera's "last scanned" show `CHEM-10` where the printed label says `CHEM-0010`.
- The padding width is the width of the highest container id, which only the backend knows
  (`Container.label`).
- **Fix:** once a scan list has looked a container up, show the API's `label`. Use identify's
  label only as a placeholder until then.

## 4. Ideas (not actionable yet)

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

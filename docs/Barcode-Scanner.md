# Barcode scanner

The lab uses a **Tera HW0002** wireless scanner, paired to a computer or the iPad over Bluetooth as a keyboard ("HID" mode). Its manual is [bridge/docs/TR-UM006-EN-ZQ-2022-10-9-EV.pdf](../bridge/docs/TR-UM006-EN-ZQ-2022-10-9-EV.pdf); page numbers below are the manual's own (printed at the bottom of each page), not the PDF's.

## How the app recognises a scan

A scanner in keyboard mode "types" what it reads. To tell a scan apart from typing, the scanner is programmed to send a **backtick** (`` ` ``) first; it ends every scan with **Enter** by default. When the app sees a backtick followed quickly by characters and Enter, it takes them as a scan wherever you are, and none of those keys reach the field that has focus.

- On most pages, scanning a container opens it, and scanning a location opens the Locations page at that location.
- Logged out (for example on the login or SDS pages), scanning a container opens its newest SDS, since SDS are public. A location scan asks you to log in.
- On a form with a location field (Add Container, editing a container, Edit Location), a location scan fills that field instead.
- On the Actions page, scans go into the open tab's list: containers to check out, check in (the balance is read as each one is scanned) or move; a location sets where they go. In Move Locations, scan the new parent twice in a row. Items can also be typed into the "Add by ID" box, separated by commas.
- The labels themselves don't change: they still contain `{"id":"CHEM-0292"}` or `{"id":"LOC-12"}`.

A backtick typed by hand is ignored. Nothing in the app needs one.

Code: `frontend/src/scanner/`.

## One-time setup

Do this once per scanner. The settings survive power-off; a factory reset removes them.

### 1. Pair it as a keyboard (manual p.4)

1. Scan **Bluetooth HID**.
2. Scan **Pairing**. The light flashes blue.
3. On the computer or iPad, pair with **BarCode Scanner HID** in Bluetooth settings.

### 2. Add the backtick prefix (manual pp.9, 23, 11)

1. Scan **Add Prefix** (p.9).
2. Scan the barcode for **`` ` ``**, hex **60**, in the Appendix ASCII Character Chart (p.23).
3. Scan **Exit Configuration Mode** (p.11). Without it, programming mode ends by itself after 20 seconds.

Leave the terminator at its default, **Add Carriage Return** (p.10), and the keyboard layout at **United States** (p.7).

### 3. Check it

Open any text editor, or a search box outside the app, and scan a container label. It should type:

```
`{"id":"CHEM-0292"}
```

followed by a new line. In the app, the same scan should open that container.

If it types without the backtick, step 2 didn't take; repeat it. If characters go missing or come out garbled, lower **Bluetooth HID Transfer Rate** (p.6) to Slow.

## On the iPad

While the scanner is connected as a keyboard, iPadOS hides the on-screen keyboard. To type (for example, into the Actions page's "Add by ID" box), double-press the scanner's trigger to bring the on-screen keyboard back. This needs **Double press trigger to show/hide keyboard On** (p.6) set once.

## Removing the prefix

Scan **Add Prefix** (p.9), then **Enter/Exit Programming Mode** (Appendix, p.48), without scanning a character in between. These are the manual's "Clear Prefixes" steps (p.10). A wireless factory reset (p.1) also removes it, along with every other setting, including the pairing mode.

Without the prefix, scanning only works while a field that can read a label has focus: the location picker, or the Actions page's "Add by ID" box (the scanner's Enter adds the item).

## Phone camera

Phones (and any device with a camera) can scan labels without the scanner: tap the **QR code icon** in the top bar. A camera scan does exactly what a scanner scan does on that page.

- **One scan or a list:** on most pages the camera closes after one label. On the Actions tabs it stays open, beeping (and on Android, vibrating) for each label and counting them, until you tap **Done**. It closes by itself when a scan opens a confirmation, such as scanning the destination in Move Containers.
- **Scanning a label twice:** a label held in view counts once. To scan the same label again (the new parent in Move Locations), point away from it for a second, then back.
- **HTTPS only:** browsers only allow the camera on a secure page, so it works at `https://app.cplabmanager.com` (and `localhost` in development), not over plain `http`. Like the rest of the app, that address only works on campus.
- **Permission:** the first time, the browser asks to use the camera. If it was refused, allow it again: on an iPhone in Settings › Apps › Safari › Camera, in Chrome from the icon beside the address bar.

The camera code is in `frontend/src/scanner/` (`CameraButton`, `CameraScanner`, `detector.ts`). Android Chrome decodes QR codes with its built-in detector; other browsers, including iPhone Safari, use the zxing WebAssembly decoder, which is bundled with the app and loaded the first time the camera opens.

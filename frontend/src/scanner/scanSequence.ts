// Tells the scanner's keystrokes apart from typing.
//
// The Bluetooth scanner is a keyboard: a scan arrives as a burst of key
// presses. It is programmed to send SCAN_PREFIX first and Enter last (see
// docs/Barcode-Scanner.md), so a scan is: the prefix, the label's
// characters, then Enter, each key well under MAX_KEY_GAP_MS after the last.
// Every key of a scan is swallowed, so nothing lands in whatever input has
// focus and the Enter never submits a form.
//
// Pure (no DOM) so it can be unit-tested; ScannerProvider feeds it keydowns.

export const SCAN_PREFIX = '`';
export const SCAN_TERMINATOR = 'Enter';
// The scanner sends a key every few milliseconds. A gap this long means a
// person typed the prefix, so the scan is abandoned.
export const MAX_KEY_GAP_MS = 300;
// Labels are short ({"id":"CHEM-0292"} is 18 characters).
export const MAX_SCAN_LENGTH = 64;

// Keys the scanner presses to produce a character (Shift for quotes and
// capitals) without being characters themselves.
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

// null between scans.
export type ScanState = { buffer: string; lastKeyAt: number } | null;

export type ScanStep =
  // Not part of a scan: let the key through.
  | { action: 'ignore' }
  // Part of a scan in progress: block the key.
  | { action: 'swallow' }
  // The scan ended with Enter: block the key and use `value`.
  | { action: 'complete'; value: string }
  // The scan was abandoned (too long, or an unexpected key): block the key.
  | { action: 'abort' };

export function nextScanStep(
  state: ScanState,
  key: string,
  at: number
): { state: ScanState; step: ScanStep } {
  // A scan that went quiet was a person typing the prefix. Forget it and
  // treat this key as fresh: it may start a new scan, or be ordinary typing.
  if (state && at - state.lastKeyAt > MAX_KEY_GAP_MS) {
    state = null;
  }

  if (!state) {
    if (key === SCAN_PREFIX) {
      return { state: { buffer: '', lastKeyAt: at }, step: { action: 'swallow' } };
    }
    return { state: null, step: { action: 'ignore' } };
  }

  if (MODIFIER_KEYS.has(key)) {
    return { state: { ...state, lastKeyAt: at }, step: { action: 'swallow' } };
  }
  if (key === SCAN_TERMINATOR) {
    if (state.buffer.length === 0) return { state: null, step: { action: 'abort' } };
    return { state: null, step: { action: 'complete', value: state.buffer } };
  }
  // Anything else that isn't a single character (Tab, arrows, Backspace)
  // isn't something the scanner sends.
  if (key.length !== 1) {
    return { state: null, step: { action: 'abort' } };
  }
  const buffer = state.buffer + key;
  if (buffer.length > MAX_SCAN_LENGTH) {
    return { state: null, step: { action: 'abort' } };
  }
  return { state: { buffer, lastKeyAt: at }, step: { action: 'swallow' } };
}

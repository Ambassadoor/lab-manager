import type { ScanTarget } from './identify';

// Gets every completed scan: what it refers to (null if it isn't a
// container or location label) and the raw text. Return false to pass the
// scan on to the next handler down, 'done' when the scan finished the job
// (the camera, if open, then closes), anything else when it was handled.
export type ScanHandler = (target: ScanTarget | null, raw: string) => boolean | 'done' | void;

// A registered handler. `continuous` marks one that takes a list of scans
// (the Actions tabs), so the camera stays open between them.
export type HandlerEntry = { handle: ScanHandler; continuous: boolean };

// 'done': a handler said the scan finished its job. 'handled': otherwise.
export type ScanOutcome = 'done' | 'handled';

// Offers a scan to the handlers, newest first, until one takes it; if none
// does, to `fallback` (the app-wide default).
export function runHandlers(
  entries: readonly HandlerEntry[],
  fallback: ScanHandler,
  target: ScanTarget | null,
  raw: string
): ScanOutcome {
  for (let i = entries.length - 1; i >= 0; i--) {
    const result = entries[i].handle(target, raw);
    if (result === 'done') return 'done';
    if (result !== false) return 'handled';
  }
  return fallback(target, raw) === 'done' ? 'done' : 'handled';
}

// Whether the handler that would get the next scan takes lists.
export function wantsContinuous(entries: readonly HandlerEntry[]): boolean {
  return entries.length > 0 && entries[entries.length - 1].continuous;
}

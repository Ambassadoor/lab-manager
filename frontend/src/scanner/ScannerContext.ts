import { createContext, useContext, useEffect, useRef } from 'react';
import type { HandlerEntry, ScanHandler, ScanOutcome } from './handlerStack';

export type { ScanHandler } from './handlerStack';

export type ScanMessageSeverity = 'success' | 'info' | 'warning' | 'error';

export type ScannerContextValue = {
  register: (entry: HandlerEntry) => () => void;
  // Shows a short message, for a handler to report what a scan did.
  notify: (message: string, severity?: ScanMessageSeverity) => void;
  // Hands a scan's raw text to the handlers, as the barcode scanner's keys
  // do. For the camera.
  submitScan: (raw: string) => ScanOutcome;
  // Whether the page taking scans right now takes a list of them.
  wantsContinuous: () => boolean;
};

export const ScannerContext = createContext<ScannerContextValue | null>(null);

export function useScanner(): ScannerContextValue {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error('useScanner must be used within a ScannerProvider');
  return ctx;
}

type ScanHandlerOptions = {
  // Off: the handler isn't registered (default on)
  enabled?: boolean;
  // Takes a list of scans: the camera stays open between them
  continuous?: boolean;
};

// Lets a page or field take scans while it's mounted (and `enabled`).
// Handlers stack: the most recently registered one is asked first, and the
// app-wide default (open the container or location) comes last.
export function useScanHandler(
  handler: ScanHandler,
  { enabled = true, continuous = false }: ScanHandlerOptions = {}
): void {
  const { register } = useScanner();
  // The stack holds this object, so the handler can change every render
  // without re-registering (which would move it to the top of the stack).
  const entry = useRef<HandlerEntry>({ handle: handler, continuous });
  useEffect(() => {
    entry.current.handle = handler;
    entry.current.continuous = continuous;
  });
  useEffect(() => {
    if (!enabled) return;
    return register(entry.current);
  }, [enabled, register]);
}

import { createContext, useContext, useEffect, useRef } from 'react';
import type { ScanTarget } from './identify';

export type ScanMessageSeverity = 'success' | 'info' | 'warning' | 'error';

// Gets every completed scan: what it refers to (null if it isn't a
// container or location label) and the raw text. Return false to pass the
// scan on to the next handler down; anything else means it was handled.
export type ScanHandler = (target: ScanTarget | null, raw: string) => boolean | void;

export type ScannerContextValue = {
  register: (handler: { current: ScanHandler }) => () => void;
  // Shows a short message, for a handler to report what a scan did.
  notify: (message: string, severity?: ScanMessageSeverity) => void;
};

export const ScannerContext = createContext<ScannerContextValue | null>(null);

export function useScanner(): ScannerContextValue {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error('useScanner must be used within a ScannerProvider');
  return ctx;
}

// Lets a page or field take scans while it's mounted (and `enabled`).
// Handlers stack: the most recently registered one is asked first, and the
// app-wide default (open the container or location) comes last.
export function useScanHandler(handler: ScanHandler, enabled = true): void {
  const { register } = useScanner();
  // The stack holds this ref, so the handler can change every render
  // without re-registering (which would move it to the top of the stack).
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    return register(handlerRef);
  }, [enabled, register]);
}

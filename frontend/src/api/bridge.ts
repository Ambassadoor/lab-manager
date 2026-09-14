// Fetch wrapper for the local hardware bridge (USB balance, label printer).
// Runs on localhost with no auth — the session/CSRF handling in client.ts
// doesn't apply here, so this is a separate, simpler wrapper rather than a
// reuse of apiFetch.
import type { BalanceReading, PrintConfirmation, PrinterStatus, PrintParams } from '../types';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL ?? 'http://localhost:8200';

async function bridgeFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `Bridge error ${res.status}: ${res.statusText}`);
  }

  return (await res.json()) as T;
}

export const getBalanceWeight = (): Promise<BalanceReading> => {
  return bridgeFetch('/balance/read');
};

export const tareBalance = (): Promise<{ tared: boolean }> => {
  return bridgeFetch('/balance/tare', { method: 'POST' });
};

export const getPrinterStatus = (): Promise<PrinterStatus> => {
  return bridgeFetch(`/print/status`, { method: 'GET' });
};

export const printLabel = (label: PrintParams): Promise<PrintConfirmation> => {
  return bridgeFetch(`/print/label`, {
    method: 'POST',
    body: JSON.stringify(label),
  });
};

// print_label() (bridge/app/printer.py) sends the raw P-touch Template
// command over a one-directional socket and always reports {"printed":
// true} once the bytes are sent — the network connection has no status
// exchange during printing (see PRINTER_PLAN.md's "Debugging log" section),
// so a 200 here only means "the printer accepted the command," not "a good
// label came out." Checking status right after is the only way to catch
// something like wrong/out-of media, which print_label() itself can't see.
//
// Every UI call site should use this instead of the raw printLabel above.
export const printLabelChecked = async (label: PrintParams): Promise<PrintConfirmation> => {
  const result = await printLabel(label);

  // Best-effort: a status check that itself fails (e.g. a transient SNMP
  // timeout) shouldn't turn a print that actually worked into a reported
  // failure — that's a worse UX than occasionally missing a real error.
  const status = await getPrinterStatus().catch(() => null);
  if (status && status.errors.length > 0) {
    // Phrased to read cleanly after every call site's own "${label} failed
    // to print: " prefix (e.g. PrintResultSnackbar) — not a sentence on its
    // own.
    throw new Error(`printer now reports an error (${status.errors.join(', ')})`);
  }

  return result;
};

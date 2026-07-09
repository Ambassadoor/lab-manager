// Fetch wrapper for the local hardware bridge (USB balance, label printer).
// Runs on localhost with no auth — the session/CSRF handling in client.ts
// doesn't apply here, so this is a separate, simpler wrapper rather than a
// reuse of apiFetch.
import type { BalanceReading } from '../types';

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

// In-memory ring buffer of recent diagnostic events (console output, uncaught
// errors, failed API/bridge calls, navigation). A bug report snapshots it so
// the report shows what happened *before* the user clicked "Report a problem".
//
// Everything is scrubbed and truncated on the way in, so the buffer never
// holds a password or an unbounded string, and the total sent stays under
// MAX_TOTAL_CHARS (the backend's hard limit is 256 KB; this is well below).
import { scrub } from './scrub';

export type DiagnosticKind = 'console' | 'error' | 'api' | 'bridge' | 'query' | 'nav';
export type DiagnosticLevel = 'error' | 'warn' | 'info';

export interface DiagnosticEntry {
  time: string;
  kind: DiagnosticKind;
  level: DiagnosticLevel;
  message: string;
  stack?: string;
  // Set when identical recent events were collapsed into this one; `time` is
  // then the latest occurrence and `firstTime` the earliest.
  repeats?: number;
  firstTime?: string;
}

const MAX_ENTRIES = 100;
const MAX_MESSAGE_CHARS = 2000;
const MAX_STACK_CHARS = 4000;
const MAX_TOTAL_CHARS = 50_000;
const REPEAT_LOOKBACK = 10;

const entries: DiagnosticEntry[] = [];

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… [truncated]` : text;
}

function entrySize(entry: DiagnosticEntry): number {
  return entry.message.length + (entry.stack?.length ?? 0) + 64;
}

export function record(
  kind: DiagnosticKind,
  level: DiagnosticLevel,
  message: string,
  stack?: string
): void {
  const time = new Date().toISOString();
  const cleaned = clip(scrub(message), MAX_MESSAGE_CHARS);
  // Pollers (printer status) and render loops repeat the same failure; one
  // entry with a count keeps them from pushing everything else out. Looks
  // back a few entries, not just the last one — the printer poll interleaves
  // with whatever the user is doing. The merged entry moves to the end so
  // the list stays ordered by `time`.
  const start = Math.max(0, entries.length - REPEAT_LOOKBACK);
  for (let i = entries.length - 1; i >= start; i--) {
    const prior = entries[i];
    if (prior.kind === kind && prior.level === level && prior.message === cleaned) {
      entries.splice(i, 1);
      entries.push({
        ...prior,
        firstTime: prior.firstTime ?? prior.time,
        time,
        repeats: (prior.repeats ?? 1) + 1,
      });
      return;
    }
  }
  entries.push({
    time,
    kind,
    level,
    message: cleaned,
    ...(stack ? { stack: clip(scrub(stack), MAX_STACK_CHARS) } : {}),
  });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

// Newest entries win: drop from the oldest end until the total fits.
export function snapshotEntries(): DiagnosticEntry[] {
  const kept: DiagnosticEntry[] = [];
  let total = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    total += entrySize(entries[i]);
    if (total > MAX_TOTAL_CHARS) break;
    kept.push(entries[i]);
  }
  return kept.reverse();
}

// Errors already recorded at the fetch layer (apiFetch/bridgeFetch). The
// global TanStack Query handlers see the same error objects again when a
// query/mutation fails, and skip these so each failure is logged once.
const recordedErrors = new WeakSet<object>();

export function markRecorded(error: unknown): void {
  if (error && typeof error === 'object') recordedErrors.add(error);
}

export function wasRecorded(error: unknown): boolean {
  return !!error && typeof error === 'object' && recordedErrors.has(error);
}

// Best-effort string form of anything passed to console.* or thrown.
export function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // Circular structure, BigInt, etc.
    return String(value);
  }
}

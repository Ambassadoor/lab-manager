// Assembles the `diagnostics` object sent with a bug report — the private
// half that only appears in Django admin. The bug report dialog (and the
// ErrorBoundary's "Report this problem") calls buildDiagnostics() at submit.
import { snapshotEntries, type DiagnosticEntry } from './buffer';
import { scrub } from './scrub';

export const APP_VERSION = __APP_VERSION__;

// Things only React-land knows; passed in by the caller.
export interface DiagnosticsContext {
  role?: string | null;
  // Last known bridge printer status from the query cache, if any.
  printerStatus?: unknown;
  // The crash being reported, when sent from the ErrorBoundary.
  crash?: unknown;
}

export interface Diagnostics {
  capturedAt: string;
  appVersion: string;
  url: string;
  role: string | null;
  system: Record<string, unknown>;
  printerStatus?: unknown;
  crash?: { name: string; message: string; stack?: string };
  events: DiagnosticEntry[];
}

interface UserAgentData {
  platform?: string;
  mobile?: boolean;
  brands?: { brand: string; version: string }[];
}

function systemInfo(): Record<string, unknown> {
  const uaData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  return {
    userAgent: navigator.userAgent,
    platform: uaData?.platform ?? null,
    mobile: uaData?.mobile ?? null,
    brands: uaData?.brands?.map((b) => `${b.brand} ${b.version}`) ?? null,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
    // CssBaseline's enableColorScheme mirrors the app's light/dark toggle
    // onto <html>'s color-scheme, so this is the mode the user actually sees.
    colorScheme: getComputedStyle(document.documentElement).colorScheme || null,
    touch: navigator.maxTouchPoints > 0,
  };
}

function serializeCrash(crash: unknown): Diagnostics['crash'] {
  if (crash instanceof Error) {
    return {
      name: crash.name,
      message: scrub(crash.message),
      ...(crash.stack ? { stack: scrub(crash.stack) } : {}),
    };
  }
  return { name: 'NonError', message: scrub(String(crash)) };
}

export function buildDiagnostics(context: DiagnosticsContext = {}): Diagnostics {
  return {
    capturedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    url: scrub(window.location.pathname + window.location.search),
    role: context.role ?? null,
    system: systemInfo(),
    ...(context.printerStatus !== undefined ? { printerStatus: context.printerStatus } : {}),
    ...(context.crash !== undefined ? { crash: serializeCrash(context.crash) } : {}),
    events: snapshotEntries(),
  };
}

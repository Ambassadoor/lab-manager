// Global hooks that feed the diagnostics buffer. Called once from main.tsx
// before render() so errors during startup are caught too.
import { describe, record, type DiagnosticLevel } from './buffer';

// Survives Vite HMR re-running this module, which would otherwise wrap
// console.error a second time (and log every message twice).
const INSTALLED = Symbol.for('lab-manager.diagnostics.installed');

type ConsoleMethod = 'error' | 'warn';
const CONSOLE_LEVELS: Record<ConsoleMethod, DiagnosticLevel> = { error: 'error', warn: 'warn' };

export function installDiagnostics(): void {
  const flags = globalThis as unknown as Record<symbol, boolean>;
  if (flags[INSTALLED]) return;
  flags[INSTALLED] = true;

  // console.log/info are left alone — mostly dev noise, not bug evidence.
  for (const method of Object.keys(CONSOLE_LEVELS) as ConsoleMethod[]) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      try {
        const error = args.find((arg): arg is Error => arg instanceof Error);
        record('console', CONSOLE_LEVELS[method], args.map(describe).join(' '), error?.stack);
      } catch {
        // Recording must never break logging itself.
      }
      original(...args);
    };
  }

  window.addEventListener('error', (event) => {
    const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : '';
    record(
      'error',
      'error',
      `Uncaught ${describe(event.error ?? event.message)}${where}`,
      (event.error as Error | undefined)?.stack
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    record(
      'error',
      'error',
      `Unhandled promise rejection: ${describe(reason)}`,
      reason instanceof Error ? reason.stack : undefined
    );
  });
}

import { describe, expect, it } from 'vitest';
import {
  MAX_KEY_GAP_MS,
  MAX_SCAN_LENGTH,
  nextScanStep,
  SCAN_PREFIX,
  type ScanState,
  type ScanStep,
} from './scanSequence';

// Feeds keys through the state machine, `gap` ms apart, and returns each step.
function run(keys: string[], gap = 5, start = 1000): ScanStep[] {
  let state: ScanState = null;
  return keys.map((key, i) => {
    const result = nextScanStep(state, key, start + i * gap);
    state = result.state;
    return result.step;
  });
}

// What the scanner sends for {"id":"CHEM-0292"}: the prefix, each character
// with Shift where a US keyboard needs it, then Enter.
function scannerKeys(text: string): string[] {
  const shifted = new Set(['{', '}', '"', ':', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']);
  return [SCAN_PREFIX, ...[...text].flatMap((c) => (shifted.has(c) ? ['Shift', c] : [c])), 'Enter'];
}

describe('nextScanStep', () => {
  it('reads a whole scan and swallows every key of it', () => {
    const steps = run(scannerKeys('{"id":"CHEM-0292"}'));

    expect(steps.slice(0, -1).every((s) => s.action === 'swallow')).toBe(true);
    expect(steps.at(-1)).toEqual({ action: 'complete', value: '{"id":"CHEM-0292"}' });
  });

  it('lets ordinary typing through', () => {
    expect(run(['a', 'B', '1', 'Enter', 'Tab']).map((s) => s.action)).toEqual([
      'ignore',
      'ignore',
      'ignore',
      'ignore',
      'ignore',
    ]);
  });

  it('lets typing before and after a scan through', () => {
    const steps = run(['x', ...scannerKeys('LOC-12'), 'y']);

    expect(steps[0].action).toBe('ignore');
    expect(steps.at(-2)).toEqual({ action: 'complete', value: 'LOC-12' });
    expect(steps.at(-1)?.action).toBe('ignore');
  });

  it('reads two scans in a row', () => {
    const steps = run([...scannerKeys('CHEM-1'), ...scannerKeys('CHEM-2')]);

    expect(steps.filter((s) => s.action === 'complete')).toEqual([
      { action: 'complete', value: 'CHEM-1' },
      { action: 'complete', value: 'CHEM-2' },
    ]);
  });

  it('gives up on a backtick typed by a person, and lets the next key through', () => {
    // The backtick is held back; the next key arrives much later.
    const steps = run([SCAN_PREFIX, 'a', 'b'], MAX_KEY_GAP_MS + 1);

    expect(steps.map((s) => s.action)).toEqual(['swallow', 'ignore', 'ignore']);
  });

  it('starts a fresh scan when a stale one is followed by a new prefix', () => {
    let state: ScanState = nextScanStep(null, SCAN_PREFIX, 0).state;
    state = nextScanStep(state, 'x', 5).state;
    const later = 5 + MAX_KEY_GAP_MS + 1;
    let result = nextScanStep(state, SCAN_PREFIX, later);
    expect(result.step.action).toBe('swallow');
    result = nextScanStep(result.state, '7', later + 5);
    result = nextScanStep(result.state, 'Enter', later + 10);

    expect(result.step).toEqual({ action: 'complete', value: '7' });
  });

  it('abandons a scan that runs too long', () => {
    const steps = run([SCAN_PREFIX, ...'x'.repeat(MAX_SCAN_LENGTH + 1)]);

    expect(steps.at(-1)?.action).toBe('abort');
    expect(steps.slice(0, -1).every((s) => s.action === 'swallow')).toBe(true);
  });

  it('abandons a scan interrupted by a key the scanner never sends', () => {
    expect(run([SCAN_PREFIX, 'C', 'ArrowLeft', 'x']).map((s) => s.action)).toEqual([
      'swallow',
      'swallow',
      'abort',
      'ignore',
    ]);
  });

  it('treats the prefix followed straight by Enter as nothing scanned', () => {
    expect(run([SCAN_PREFIX, 'Enter']).map((s) => s.action)).toEqual(['swallow', 'abort']);
  });
});

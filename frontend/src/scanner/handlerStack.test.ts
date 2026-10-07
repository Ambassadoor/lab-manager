import { describe, expect, it, vi } from 'vitest';
import { runHandlers, wantsContinuous, type HandlerEntry, type ScanHandler } from './handlerStack';
import type { ScanTarget } from './identify';

const target: ScanTarget = { kind: 'container', id: 1, slug: 'chem-1', label: 'CHEM-0001' };
const raw = '{"id":"CHEM-0001"}';

const entry = (handle: ScanHandler, continuous = false): HandlerEntry => ({ handle, continuous });

describe('runHandlers', () => {
  it('gives the scan to the newest handler first', () => {
    const older = vi.fn();
    const newer = vi.fn();
    const fallback = vi.fn();
    expect(runHandlers([entry(older), entry(newer)], fallback, target, raw)).toBe('handled');
    expect(newer).toHaveBeenCalledWith(target, raw);
    expect(older).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('passes the scan down when a handler returns false', () => {
    const older = vi.fn();
    const fallback = vi.fn();
    runHandlers([entry(older), entry(() => false)], fallback, target, raw);
    expect(older).toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to the default when every handler passes', () => {
    const fallback = vi.fn();
    expect(runHandlers([entry(() => false)], fallback, null, 'junk')).toBe('handled');
    expect(fallback).toHaveBeenCalledWith(null, 'junk');
  });

  it("reports 'done' from a handler or the default", () => {
    expect(runHandlers([entry(() => 'done')], vi.fn(), target, raw)).toBe('done');
    expect(runHandlers([], () => 'done', target, raw)).toBe('done');
  });
});

describe('wantsContinuous', () => {
  it('follows the handler that would get the next scan', () => {
    expect(wantsContinuous([])).toBe(false);
    expect(wantsContinuous([entry(vi.fn(), true)])).toBe(true);
    // A field taking scans above a list page: one scan at a time
    expect(wantsContinuous([entry(vi.fn(), true), entry(vi.fn())])).toBe(false);
  });
});

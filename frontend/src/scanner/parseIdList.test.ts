import { describe, expect, it } from 'vitest';
import { parseIdList } from './parseIdList';

const tokens = (text: string, flush = false) =>
  parseIdList(text, flush).entries.map((e) => e.token);

describe('parseIdList', () => {
  it('keeps an entry still being typed as the remainder', () => {
    expect(parseIdList('CHEM-1')).toEqual({ entries: [], remainder: 'CHEM-1' });
  });

  it('completes an entry once a comma follows it', () => {
    const { entries, remainder } = parseIdList('CHEM-1,');

    expect(entries).toEqual([
      { token: 'CHEM-1', target: { kind: 'container', id: 1, slug: 'chem-1', label: 'CHEM-1' } },
    ]);
    expect(remainder).toBe('');
  });

  it('splits a pasted list, keeping the unfinished end', () => {
    const { remainder } = parseIdList('CHEM-1, CHEM-2,LOC-4,  CHEM-3');

    expect(tokens('CHEM-1, CHEM-2,LOC-4,  CHEM-3')).toEqual(['CHEM-1', 'CHEM-2', 'LOC-4']);
    expect(remainder).toBe('CHEM-3');
  });

  it('finishes the remainder on flush (Enter)', () => {
    expect(parseIdList('CHEM-1, CHEM-2', true)).toMatchObject({ remainder: '' });
    expect(tokens('CHEM-1, CHEM-2', true)).toEqual(['CHEM-1', 'CHEM-2']);
  });

  it('accepts line breaks, as from a pasted column', () => {
    expect(tokens('CHEM-1\nCHEM-2\nLOC-3\n')).toEqual(['CHEM-1', 'CHEM-2', 'LOC-3']);
  });

  it('separates space-separated entries in a completed segment', () => {
    expect(tokens('CHEM-1 CHEM-2,')).toEqual(['CHEM-1', 'CHEM-2']);
  });

  it('ignores empty entries', () => {
    expect(tokens(',, CHEM-1,,', true)).toEqual(['CHEM-1']);
  });

  it('reports invalid entries instead of dropping them', () => {
    const { entries } = parseIdList('CHEM-1, CHEM-12x, LOC-2,');

    expect(entries.map((e) => [e.token, e.target?.kind ?? null])).toEqual([
      ['CHEM-1', 'container'],
      ['CHEM-12x', null],
      ['LOC-2', 'location'],
    ]);
  });

  it('reads scanned label JSON typed into the box', () => {
    expect(parseIdList('{"id":"CHEM-0292"},').entries[0].target).toMatchObject({
      kind: 'container',
      slug: 'chem-292',
    });
  });
});

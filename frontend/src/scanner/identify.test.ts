import { describe, expect, it } from 'vitest';
import { identify } from './identify';

describe('identify', () => {
  it.each([
    ['{"id":"CHEM-0292"}', 'chem-292'],
    ['CHEM-0292', 'chem-292'],
    ['chem-292', 'chem-292'],
    ['Chem-292', 'chem-292'],
    ['  CHEM-292  ', 'chem-292'],
    // iPadOS Smart Punctuation turns the label's quotes curly
    ['{“id”:“CHEM-0292”}', 'chem-292'],
    // Auto-capitalisation can turn "id" into "Id"
    ['{"Id":"CHEM-7"}', 'chem-7'],
  ])('reads %s as container %s', (raw, slug) => {
    expect(identify(raw)).toMatchObject({ kind: 'container', slug });
  });

  it.each([
    ['{"id":"LOC-12"}', 12],
    ['LOC-12', 12],
    ['loc-012', 12],
    // Location labels printed before LOC-<id> carry the bare number
    ['{"id":12}', 12],
  ])('reads %s as location %d', (raw, id) => {
    expect(identify(raw)).toMatchObject({ kind: 'location', id });
  });

  it('gives the container id', () => {
    expect(identify('{"id":"CHEM-0292"}')).toMatchObject({ kind: 'container', id: 292 });
  });

  it('gives display labels', () => {
    expect(identify('chem-0292')?.label).toBe('CHEM-292');
    expect(identify('loc-7')?.label).toBe('LOC-7');
  });

  it.each(['', 'hello', 'CHEM-', 'CHEM-12x', 'LOC-a', '12', '{"id":"CHEM-1"', '{"name":"x"}'])(
    'rejects %j',
    (raw) => {
      expect(identify(raw)).toBeNull();
    }
  );
});

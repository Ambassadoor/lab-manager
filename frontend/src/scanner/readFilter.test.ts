import { describe, expect, it } from 'vitest';
import { createReadFilter, REARM_MS } from './readFilter';

const A = '{"id":"CHEM-0001"}';
const B = '{"id":"LOC-12"}';

// Feeds one frame's values every `gap` ms and collects every read.
function frames(values: string[][], gap = 100) {
  const filter = createReadFilter();
  return values.flatMap((frame, i) => filter(frame, i * gap));
}

describe('createReadFilter', () => {
  it('reads a label held in view once', () => {
    expect(frames([[A], [A], [A], [A], [A]])).toEqual([A]);
  });

  it('counts a label seen twice in one frame once', () => {
    expect(frames([[A, A]])).toEqual([A]);
  });

  it('reads two labels in view together', () => {
    expect(
      frames([
        [A, B],
        [A, B],
      ])
    ).toEqual([A, B]);
  });

  it('reads a second label coming into view while the first stays', () => {
    expect(frames([[A], [A], [A, B], [A, B]])).toEqual([A, B]);
  });

  it('ignores a few frames where the decoder misses a label still in view', () => {
    expect(frames([[A], [], [], [A], [], [A]])).toEqual([A]);
  });

  it('reads a label again after it has been out of view long enough', () => {
    const filter = createReadFilter();
    expect(filter([A], 0)).toEqual([A]);
    expect(filter([], 500)).toEqual([]);
    expect(filter([A], REARM_MS)).toEqual([]);
    expect(filter([], REARM_MS + 500)).toEqual([]);
    // Last seen at REARM_MS, so it rearms once REARM_MS more has passed
    expect(filter([A], 2 * REARM_MS + 1)).toEqual([A]);
  });

  it('reads it again only once per return', () => {
    const filter = createReadFilter();
    filter([A], 0);
    expect(filter([A], 5000)).toEqual([A]);
    expect(filter([A], 5100)).toEqual([]);
  });
});

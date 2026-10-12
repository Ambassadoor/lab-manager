import { describe, expect, it } from 'vitest';
import { lipscombIdFrom } from './lipscombId';

describe('lipscombIdFrom', () => {
  it('reads the ID out of an ID card scan', () => {
    expect(lipscombIdFrom('02274838901')).toBe('L22748389');
  });

  it('takes the ID as printed, however it was typed', () => {
    expect(lipscombIdFrom('L22748389')).toBe('L22748389');
    expect(lipscombIdFrom('l2274 8389')).toBe('L22748389');
  });

  it('is null for anything else', () => {
    expect(lipscombIdFrom('Grace Hopper')).toBe(null);
    expect(lipscombIdFrom('22748389')).toBe(null);
    expect(lipscombIdFrom('0227483890')).toBe(null);
    expect(lipscombIdFrom('{"id":"CHEM-0001"}')).toBe(null);
  });
});

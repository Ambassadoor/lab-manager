import { describe, expect, it } from 'vitest';
import type { Container } from '../../types';
import {
  NO_CONTENTS,
  contentsPatch,
  contentsProblem,
  missingContents,
  withContents,
} from './checkInContents';

const container = (fields: Partial<Container>) =>
  ({ initial_quantity: null, quantity_unit: null, density: null, ...fields }) as Container;

describe('missingContents', () => {
  it('asks for quantity when there is none, and density only for a volume', () => {
    expect(missingContents(container({}), NO_CONTENTS)).toEqual({
      quantity: true,
      density: false,
    });
    expect(missingContents(container({}), { ...NO_CONTENTS, unit: 'mL' })).toEqual({
      quantity: true,
      density: true,
    });
    expect(
      missingContents(container({ initial_quantity: 500, quantity_unit: 'mL' }), NO_CONTENTS)
    ).toEqual({ quantity: false, density: true });
    expect(
      missingContents(
        container({ initial_quantity: 500, quantity_unit: 'mL', density: '0.79' }),
        NO_CONTENTS
      )
    ).toEqual({ quantity: false, density: false });
  });
});

describe('contentsPatch', () => {
  it('saves quantity and unit together, once both are valid', () => {
    const empty = container({});
    expect(contentsPatch(empty, { ...NO_CONTENTS, quantity: '500' })).toBeNull();
    expect(contentsPatch(empty, { ...NO_CONTENTS, quantity: '500', unit: 'g' })).toEqual({
      initial_quantity: 500,
      quantity_unit: 'g',
    });
  });

  it('saves a valid density for a volume', () => {
    const bottle = container({ initial_quantity: 500, quantity_unit: 'mL' });
    expect(contentsPatch(bottle, { ...NO_CONTENTS, density: '0.7893' })).toEqual({
      density: '0.7893',
    });
    expect(contentsPatch(bottle, { ...NO_CONTENTS, density: '0.78931' })).toBeNull();
  });

  it('never overwrites what the container already has', () => {
    const full = container({ initial_quantity: 500, quantity_unit: 'mL', density: '1' });
    expect(contentsPatch(full, { quantity: '1', unit: 'L', density: '2' })).toBeNull();
  });
});

describe('withContents', () => {
  it('fills in typed values for working out the mass', () => {
    const result = withContents(container({}), { quantity: '2', unit: 'L', density: '0.5' });
    expect(result.initial_quantity).toBe(2);
    expect(result.quantity_unit).toBe('L');
    expect(result.density).toBe('0.5');
  });
});

describe('contentsProblem', () => {
  it('is null while blank, and names a bad value', () => {
    const empty = container({});
    expect(contentsProblem(empty, NO_CONTENTS)).toBeNull();
    expect(contentsProblem(empty, { ...NO_CONTENTS, quantity: '2.5', unit: 'g' })).toMatch(
      /whole number/
    );
    expect(contentsProblem(empty, { ...NO_CONTENTS, quantity: '5' })).toMatch(/unit/);
    expect(contentsProblem(empty, { quantity: '5', unit: 'mL', density: 'abc' })).toMatch(
      /Density/
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  contentMassGrams,
  convertUnits,
  estimateTare,
  isValidTare,
  isVolumeUnit,
  percentRemaining,
} from './units';

describe('contentMassGrams', () => {
  it.each([
    [500, 'mg', null, 0.5],
    [500, 'g', null, 500],
    [2, 'kg', null, 2000],
    [500, 'mL', '0.79', 395],
    [2, 'L', '1.2', 2400],
  ] as const)('%s %s at density %s is %s g', (quantity, unit, density, grams) => {
    expect(
      contentMassGrams({ initial_quantity: quantity, quantity_unit: unit, density })
    ).toBeCloseTo(grams);
  });

  it('is null for a volume with no density, or a missing quantity or unit', () => {
    expect(contentMassGrams({ initial_quantity: 500, quantity_unit: 'mL', density: null })).toBe(
      null
    );
    expect(contentMassGrams({ initial_quantity: null, quantity_unit: 'g', density: null })).toBe(
      null
    );
    expect(contentMassGrams({ initial_quantity: 500, quantity_unit: null, density: '1' })).toBe(
      null
    );
  });
});

describe('estimateTare', () => {
  it('subtracts the estimated remaining contents from the current weight', () => {
    // 500 g bottle contents, about 40% left, 612 g on the balance
    expect(estimateTare(612, 500, 40)).toBe(412);
  });

  it('can come out negative when the estimate is too high', () => {
    expect(estimateTare(300, 500, 80)).toBe(-100);
  });
});

describe('percentRemaining', () => {
  it('rounds half up like the backend', () => {
    expect(percentRemaining(612, 412, 500)).toBe(40);
    expect(percentRemaining(612.5, 400, 500)).toBe(43);
  });

  it('is negative when the tare is more than the weight', () => {
    expect(percentRemaining(300, 400, 500)).toBe(-20);
  });

  it('is null without a content mass', () => {
    expect(percentRemaining(300, 100, 0)).toBe(null);
  });
});

describe('convertUnits', () => {
  it('converts within a family', () => {
    expect(convertUnits('g', 'kg', 2)).toBe(2000);
    expect(convertUnits('mL', 'L', '1.5')).toBe(1500);
  });
});

describe('isValidTare', () => {
  it('takes a number above 0 only', () => {
    expect(isValidTare('212.5')).toBe(true);
    expect(isValidTare('0')).toBe(false);
    expect(isValidTare('-100')).toBe(false);
    expect(isValidTare('abc')).toBe(false);
  });
});

describe('isVolumeUnit', () => {
  it('is true for mL and L only', () => {
    expect(isVolumeUnit('mL')).toBe(true);
    expect(isVolumeUnit('L')).toBe(true);
    expect(isVolumeUnit('g')).toBe(false);
    expect(isVolumeUnit('')).toBe(false);
    expect(isVolumeUnit(null)).toBe(false);
  });
});

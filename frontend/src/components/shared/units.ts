import Decimal from 'decimal.js';
import type { Container } from '../../types';

// Converts a quantity from currentUnit to defaultUnit's unit family (mass or volume).
export const convertUnits = (
  defaultUnit: string,
  currentUnit: string,
  quantity: string | number
) => {
  const massUnits = ['mg', 'g', 'kg'];
  const volumeUnits = ['mL', 'L'];
  const q = new Decimal(parseFloat(String(quantity)));
  if (defaultUnit.includes('g')) {
    const power = massUnits.indexOf(currentUnit) - massUnits.indexOf(defaultUnit);
    const result = q.times(1000 ** power).toNumber();
    return result;
  } else if (defaultUnit.includes('L')) {
    const power = volumeUnits.indexOf(currentUnit) - volumeUnits.indexOf(defaultUnit);
    const result = q.times(1000 ** power).toNumber();
    return result;
  }
  return parseFloat(String(quantity));
};

const GRAMS_PER_UNIT: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 };
const ML_PER_UNIT: Record<string, number> = { mL: 1, L: 1000 };

// Litres or millilitres: a volume, which needs a density to give a mass.
export const isVolumeUnit = (unit: string | null | undefined) => !!unit && unit in ML_PER_UNIT;

type ContentFields = Pick<Container, 'initial_quantity' | 'quantity_unit' | 'density'>;

// The original contents' mass in grams, as Container.initial_content_mass
// on the backend: a mass converted to grams, or a volume times its density
// (g/mL). Null when it can't be known (no quantity or unit, or a volume
// with no density).
export function contentMassGrams({
  initial_quantity,
  quantity_unit,
  density,
}: ContentFields): number | null {
  if (initial_quantity == null || !quantity_unit) return null;
  const quantity = new Decimal(initial_quantity);
  if (quantity_unit in GRAMS_PER_UNIT) {
    return quantity.times(GRAMS_PER_UNIT[quantity_unit]).toNumber();
  }
  if (quantity_unit in ML_PER_UNIT && density) {
    return quantity.times(ML_PER_UNIT[quantity_unit]).times(density).toNumber();
  }
  return null;
}

// The empty container's weight, from what it weighs now and roughly how
// much of its original contents is left: current − contents × percent.
// Rounded to 0.01 g.
export function estimateTare(currentWeight: number, contentMassG: number, percent: number) {
  return new Decimal(currentWeight)
    .minus(new Decimal(contentMassG).times(percent).dividedBy(100))
    .toDecimalPlaces(2)
    .toNumber();
}

// Percent of the original contents left, as Container.percent_remaining on
// the backend (rounded half up to a whole number). Null if there's no mass.
export function percentRemaining(weight: number, tare: number, contentMassG: number) {
  if (!contentMassG) return null;
  return new Decimal(weight)
    .minus(tare)
    .dividedBy(contentMassG)
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

// A tare weight Check In can send: a plain number above 0 (the server
// refuses 0 or less; an empty container always weighs something).
export const isValidTare = (tare: string) => /^\d+(\.\d+)?$/.test(tare) && Number(tare) > 0;

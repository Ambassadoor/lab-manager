import type { Container, ContainerPatch } from '../../types';
import { isVolumeUnit } from '../shared/units';

// What Check In can fill in about a container's original contents, so a
// tare can be estimated for one entered without them. Held as typed text.
export type Contents = { quantity: string; unit: string; density: string };
export const NO_CONTENTS: Contents = { quantity: '', unit: '', density: '' };

export const QUANTITY_UNITS = ['mg', 'g', 'kg', 'mL', 'L'] as const;

// The backend's limits: a whole-number quantity, and a density of up to
// 3 digits and 4 decimal places (0.7893, 13.534)
const WHOLE_NUMBER = /^\d+$/;
const DENSITY = /^\d{1,3}(\.\d{1,4})?$/;

const validQuantity = (q: string) => WHOLE_NUMBER.test(q) && Number(q) > 0;
const validUnit = (u: string) => (QUANTITY_UNITS as readonly string[]).includes(u);
const validDensity = (d: string) => DENSITY.test(d) && Number(d) > 0;

// Which of them the container is missing. Density only matters for a
// volume, including one being typed in now.
export function missingContents(container: Container, contents: Contents) {
  const quantity = container.initial_quantity == null || !container.quantity_unit;
  const unit = quantity ? contents.unit : container.quantity_unit;
  return { quantity, density: !container.density && isVolumeUnit(unit) };
}

// The container with whatever valid values have been typed for what it's
// missing, for working out its content mass.
export function withContents(container: Container, contents: Contents): Container {
  const patch = contentsPatch(container, contents);
  return patch ? ({ ...container, ...patch } as Container) : container;
}

// The fields to save on the container: only what it was missing, and only
// once valid (quantity and unit together). Null if there's nothing.
export function contentsPatch(container: Container, contents: Contents): ContainerPatch | null {
  const missing = missingContents(container, contents);
  const patch: ContainerPatch = {};
  if (missing.quantity && validQuantity(contents.quantity) && validUnit(contents.unit)) {
    patch.initial_quantity = Number(contents.quantity);
    patch.quantity_unit = contents.unit as ContainerPatch['quantity_unit'];
  }
  if (missing.density && validDensity(contents.density)) patch.density = contents.density;
  return Object.keys(patch).length > 0 ? patch : null;
}

// What's wrong with what's been typed, if anything. Blank isn't wrong:
// filling these in is optional.
export function contentsProblem(container: Container, contents: Contents): string | null {
  const missing = missingContents(container, contents);
  if (missing.quantity && contents.quantity && !validQuantity(contents.quantity)) {
    return 'Quantity: a whole number above 0';
  }
  if (missing.quantity && contents.quantity && !contents.unit) return 'Choose a unit';
  if (missing.density && contents.density && !validDensity(contents.density)) {
    return 'Density: a number above 0, up to 4 decimal places';
  }
  return null;
}

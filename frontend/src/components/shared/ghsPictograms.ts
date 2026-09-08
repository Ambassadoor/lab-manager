// The 9 standard GHS pictogram categories (see GHSPictogram in
// backend/apps/inventory/models/containers.py) — rendered as plain MUI Chips
// for now (no pictogram artwork bundled); swapping in the real
// black-and-red-diamond icon images later is a drop-in change to whatever
// renders this list, not a structural one.
import type { GHSPictogram } from '../../types';

export const GHS_PICTOGRAMS: { value: GHSPictogram; label: string }[] = [
  { value: 'flammable', label: 'Flammable' },
  { value: 'oxidizing', label: 'Oxidizing' },
  { value: 'compressed_gas', label: 'Compressed Gas' },
  { value: 'corrosive', label: 'Corrosive' },
  { value: 'toxic', label: 'Acute Toxicity' },
  { value: 'harmful', label: 'Irritant / Harmful' },
  { value: 'health_hazard', label: 'Health Hazard' },
  { value: 'explosive', label: 'Explosive' },
  { value: 'environment', label: 'Environmental Hazard' },
];

export const ghsPictogramLabel = (value: GHSPictogram): string =>
  GHS_PICTOGRAMS.find((p) => p.value === value)?.label ?? value;

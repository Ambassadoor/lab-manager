// The 9 standard GHS pictogram categories (see GHSPictogram in
// backend/apps/inventory/models/containers.py). Icon files live in
// frontend/public/ghs/<value>.png (Vite serves public/ as-is, no import
// needed) — see ghsPictogramIconSrc.
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

export const ghsPictogramIconSrc = (value: GHSPictogram): string => `/ghs/${value}.png`;

import { parseBarcode } from '../components/shared/parseBarcode';

// What a scanned label or a typed id refers to.
export type ScanTarget =
  // `slug` is how the API looks a container up ("chem-292"), `id` its
  // primary key (292); `label` is for showing back to the user: the id as
  // it was scanned or typed, so a scanned label shows exactly as printed
  // ("CHEM-0292"). Once the container is looked up, its own `label` is
  // the one to show (a typed "chem-10" is printed "CHEM-0010").
  | { kind: 'container'; id: number; slug: string; label: string }
  | { kind: 'location'; id: number; label: string };

// Printed container labels are zero-padded to the width of the highest id
// ("CHEM-0292") while the slug isn't ("chem-292"). Same rule as the
// backend's normalize_container_slug.
const CONTAINER_ID = /^chem-0*(\d+)$/i;
const LOCATION_ID = /^loc-(\d+)$/i;

// Accepts a label's JSON ({"id":"CHEM-0292"}, as printed in the barcode) or
// a bare id as someone would type it ("CHEM-0292", "chem-292", "LOC-12").
// Anything else is null.
export function identify(raw: string): ScanTarget | null {
  const text = raw.trim();
  const id = text.includes('{') ? parseBarcode(text) : text;
  if (!id) return null;

  const container = CONTAINER_ID.exec(id.trim());
  if (container) {
    const n = Number(container[1]);
    // The padding is the width of the highest container id, which only the
    // server knows, so it's kept from the input rather than rebuilt
    const label = id.trim().toUpperCase();
    return { kind: 'container', id: n, slug: `chem-${n}`, label };
  }
  const location = LOCATION_ID.exec(id.trim());
  if (location) {
    const n = Number(location[1]);
    return { kind: 'location', id: n, label: `LOC-${n}` };
  }
  return null;
}

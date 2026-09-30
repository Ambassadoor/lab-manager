export const parseBarcode = (raw: string): string | null => {
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart));
    if (typeof parsed.id === 'string') return parsed.id;
    // Location labels printed before the LOC-<id> encoding carry the bare
    // numeric id; container labels are always CHEM-<id> strings, so a
    // number can only be a location.
    if (typeof parsed.id === 'number') return `LOC-${parsed.id}`;
    return null;
  } catch {
    return null;
  }
};

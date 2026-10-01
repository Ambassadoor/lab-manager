// A Bluetooth scanner "types" the barcode as a keyboard, so the OS's typing
// helpers apply to it. iOS/iPadOS Smart Punctuation turns the JSON's straight
// quotes into curly ones (“ ” „ ‟), which JSON.parse rejects — the scan then
// isn't recognised at all, and the scanner's trailing Enter submits the form.
const CURLY_DOUBLE_QUOTES = /[“”„‟]/g;

export const parseBarcode = (raw: string): string | null => {
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart).replace(CURLY_DOUBLE_QUOTES, '"'));
    // Key matched case-insensitively: auto-capitalisation can turn the
    // first typed letter, the "i" of "id", into "Id".
    const idKey = Object.keys(parsed).find((key) => key.toLowerCase() === 'id');
    const id = idKey === undefined ? undefined : parsed[idKey];
    if (typeof id === 'string') return id;
    // Location labels printed before the LOC-<id> encoding carry the bare
    // numeric id; container labels are always CHEM-<id> strings, so a
    // number can only be a location.
    if (typeof id === 'number') return `LOC-${id}`;
    return null;
  } catch {
    return null;
  }
};

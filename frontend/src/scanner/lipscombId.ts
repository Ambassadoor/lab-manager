import { LIPSCOMB_ID_PATTERN, normalizeLipscombId } from '../components/shared/formRules';

// A Lipscomb ID card's barcode is 11 digits: one digit, the 8 digits of the
// ID, then two more, e.g. "02274838901" for L22748389.
const ID_CARD = /^[0-9]([0-9]{8})[0-9]{2}$/;

// The Lipscomb ID (L12345678) in a card scan or what someone typed: the
// card's 11 digits, or the ID as printed ("l2274 8389" works too). Null if
// it's neither.
export function lipscombIdFrom(raw: string): string | null {
  const value = normalizeLipscombId(raw);
  const card = ID_CARD.exec(value);
  if (card) return `L${card[1]}`;
  return LIPSCOMB_ID_PATTERN.test(value) ? value : null;
}

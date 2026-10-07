import { identify, type ScanTarget } from './identify';

export type ParsedEntry = { token: string; target: ScanTarget | null };

// Reads the "add by ID" box, where ids are typed or pasted as a list:
// "CHEM-12, CHEM-13, LOC-4". An entry counts as complete once a comma or a
// line break follows it, so rows can be added as the user types. Whatever
// follows the last separator is still being typed and comes back as
// `remainder`, unless `flush` (Enter) says the text is finished.
//
// Spaces around entries are ignored, and spaces inside a completed segment
// separate entries too, so a pasted "CHEM-1 CHEM-2," gives two. Entries that
// aren't a container or location id come back with target null, for the
// caller to show rather than drop.
export function parseIdList(
  text: string,
  flush = false
): { entries: ParsedEntry[]; remainder: string } {
  const segments = text.split(/[,\n]/);
  const remainder = flush ? '' : (segments.pop() ?? '');
  const entries = segments
    .flatMap((segment) => segment.trim().split(/\s+/))
    .filter((token) => token.length > 0)
    .map((token) => ({ token, target: identify(token) }));
  return { entries, remainder: remainder.trimStart() };
}

// What the "add by ID" box does with its text after each change (or Enter,
// with `flush`): complete entries the panel `accepts` are taken out to be
// added; complete entries it can't use stay in the box, ahead of whatever
// is still being typed, with `error` saying why, so they can be fixed.
export function readIdBox(
  text: string,
  flush: boolean,
  accepts: (target: ScanTarget) => boolean,
  describeAccepted: string
): { add: ScanTarget[]; text: string; error: string | null } {
  const { entries, remainder } = parseIdList(text, flush);
  if (entries.length === 0) return { add: [], text, error: null };

  const add: ScanTarget[] = [];
  const unknown: string[] = [];
  const wrongKind: string[] = [];
  for (const { token, target } of entries) {
    if (!target) unknown.push(token);
    else if (!accepts(target)) wrongKind.push(token);
    else add.push(target);
  }
  const kept = [...unknown, ...wrongKind];
  const errors = [
    unknown.length > 0 && `Not an ID: ${unknown.join(', ')}`,
    wrongKind.length > 0 && `${wrongKind.join(', ')}: this list takes ${describeAccepted}`,
  ].filter(Boolean);
  return {
    add,
    text: kept.length > 0 ? `${kept.join(', ')}, ${remainder}` : remainder,
    error: errors.length > 0 ? errors.join('. ') : null,
  };
}

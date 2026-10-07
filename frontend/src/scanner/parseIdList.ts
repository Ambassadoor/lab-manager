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

// How long a label must be out of the camera's view before it counts again.
export const REARM_MS = 1000;

// The camera sees a label on every frame it's in view, but it should count
// once. A label counts when it comes into view, and again only after it has
// been out of view for REARM_MS: so holding a label up reads it once, while
// pointing away and back reads it twice (Move Locations' double scan). A
// frame or two where the decoder misses a label still in view doesn't count
// as leaving it.
//
// Returns a function taking the values decoded from one frame and the time,
// which returns those that count as new reads.
export function createReadFilter(rearmMs = REARM_MS) {
  const lastSeen = new Map<string, number>();
  return (values: string[], now: number): string[] => {
    const reads: string[] = [];
    for (const value of new Set(values)) {
      const seen = lastSeen.get(value);
      if (seen === undefined || now - seen > rearmMs) reads.push(value);
      lastSeen.set(value, now);
    }
    for (const [value, seen] of lastSeen) {
      if (now - seen > rearmMs) lastSeen.delete(value);
    }
    return reads;
  };
}

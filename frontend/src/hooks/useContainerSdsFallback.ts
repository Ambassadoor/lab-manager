import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSdsList } from '../api/sds';
import { sdsKeys } from '../api/queryKeys';
import type { Container } from '../types';

// A container with no SDS of its own falls back to showing its chemical's
// other SDS instead — better than nothing for someone who's just been
// exposed and is scanning a barcode. container.latest_sds already comes
// back on the Container object itself (ContainerSerializer), so this only
// needs to fetch anything once that's confirmed null; used by ContainerDetail.
//
// `container` is optional so this can be called unconditionally before an
// early `return null` while a container query is still pending (the Rules
// of Hooks — every render has to call the same hooks in the same order).
export function useContainerSdsFallback(container: Container | undefined) {
  const enabled = !!container && !container.latest_sds;
  const query = useQuery({
    queryKey: sdsKeys.list({ chemical: container?.chemical }),
    queryFn: () => getSdsList({ chemical: container?.chemical }),
    enabled,
  });

  // The same document can be attached to more than one sibling container
  // (via SdsUploadDialog's "attach existing" flow), each getting its own
  // row pointing at the same drive_id — this list doesn't show which
  // container each row belongs to (unlike ChemicalDetail's, which does, by
  // design), so a duplicate here would just be a visually-identical link
  // shown twice for no reason. Collapse to one entry per unique document.
  const sds = useMemo(() => {
    if (!enabled) return [];
    const seen = new Set<string>();
    return (query.data ?? []).filter((s) => {
      if (seen.has(s.drive_id)) return false;
      seen.add(s.drive_id);
      return true;
    });
  }, [enabled, query.data]);

  return { ...query, sds };
}

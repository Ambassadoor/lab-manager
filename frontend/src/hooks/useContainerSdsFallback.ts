import { useQuery } from '@tanstack/react-query';
import { getSdsList } from '../api/sds';
import { sdsKeys } from '../api/queryKeys';
import type { Container } from '../types';

// A container with no SDS of its own falls back to showing its chemical's
// other SDS instead — better than nothing for someone who's just been
// exposed and is scanning a barcode. container.latest_sds already comes
// back on the Container object itself (ContainerSerializer), so this only
// needs to fetch anything once that's confirmed null; used by
// ContainerDetail and the Containers table so neither reimplements the
// "own, else chemical's other SDS" lookup.
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

  return { ...query, sds: enabled ? (query.data ?? []) : [] };
}

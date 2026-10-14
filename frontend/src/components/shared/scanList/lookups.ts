import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/client';
import { getContainerDetails, getLocationMenu } from '../../../api/inventory';
import { locationKeys } from '../../../api/queryKeys';
import type { ScanTarget } from '../../../scanner/identify';
import type { Container } from '../../../types';

// Looks a container up for an Actions panel list; a missing one becomes
// a message the list shows on its row.
export async function lookUpContainer(target: ScanTarget): Promise<Container> {
  if (target.kind !== 'container') throw new Error(`${target.label} isn't a container`);
  try {
    return await getContainerDetails(target.slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(`No container ${target.label}`, { cause: error });
    }
    throw error;
  }
}

// For lists that act on containers still on the shelves (Check Out, Move
// Containers): a discarded one is refused on its row before submitting,
// as the server would refuse it anyway.
export async function lookUpUsableContainer(target: ScanTarget): Promise<Container> {
  const container = await lookUpContainer(target);
  if (container.date_discarded) throw new Error(`${container.label} has been discarded`);
  return container;
}

export type LocationSummary = { id: number; full_path: string };

// Locations come from the location menu, which every location picker
// already loads and caches, so this rarely costs a request.
export async function lookUpLocation(
  queryClient: QueryClient,
  target: ScanTarget
): Promise<LocationSummary> {
  if (target.kind !== 'location') throw new Error(`${target.label} isn't a location`);
  const menu = await queryClient.ensureQueryData({
    queryKey: locationKeys.menu(),
    queryFn: getLocationMenu,
  });
  const location = menu.find((l) => l.id === target.id);
  if (!location) throw new Error(`No location ${target.label}`);
  return { id: location.id, full_path: location.full_path };
}

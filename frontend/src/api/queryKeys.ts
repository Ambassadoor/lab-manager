// Central query key factory for TanStack Query.
// Keys are hierarchical arrays so invalidateQueries({ queryKey: someKeys.all })
// prefix-matches every query under that resource (list, detail, related sub-resources, etc).

import type { ContainerListParams } from './inventory';

export const containerKeys = {
  all: ['containers'] as const,
  // `params` defaults to {} rather than being left undefined — TanStack's
  // partial-match invalidation treats an object segment with no keys as a
  // wildcard, so every existing `invalidateQueries({ queryKey:
  // containerKeys.list() })` call site still invalidates every
  // parameterized variant without needing to know about them.
  list: (params?: ContainerListParams) => [...containerKeys.all, 'list', params ?? {}] as const,
  detail: (slug: string) => [...containerKeys.all, 'detail', slug] as const,
  weighIns: (slug: string) => [...containerKeys.all, 'weighIns', slug] as const,
  metaData: () => [...containerKeys.all, 'metaData'] as const,
};

export const chemicalKeys = {
  all: ['chemicals'] as const,
  list: () => [...chemicalKeys.all, 'list'] as const,
  detail: (id: string) => [...chemicalKeys.all, 'detail', id] as const,
  storageCategories: () => [...chemicalKeys.all, 'storageCategories'] as const,
};

export const locationKeys = {
  all: ['locations'] as const,
  list: () => [...locationKeys.all, 'list'] as const,
  containers: (locationId: string) => [...locationKeys.all, 'containers', locationId] as const,
  types: () => [...locationKeys.all, 'types'] as const,
  menu: () => [...locationKeys.all, 'menu'] as const,
};

export const dashboardKeys = {
  all: ['dashboard'] as const,
};

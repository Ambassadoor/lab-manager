// Central query key factory for TanStack Query.
// Keys are hierarchical arrays so invalidateQueries({ queryKey: someKeys.all })
// prefix-matches every query under that resource (list, detail, related sub-resources, etc).

export const containerKeys = {
  all: ['containers'] as const,
  list: () => [...containerKeys.all, 'list'] as const,
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

// Various data fetchers
import { apiFetch, toQueryString } from './client';
import type {
  Container,
  StorageCategory,
  Location,
  CasCheck,
  ContainerOptions,
  ContainerFormDefaults,
  CheckoutEvent,
  ContainerDetailDefaults,
  ContainerPatch,
  WeighInDefaults,
  WeightReading,
  LocationType,
  Chemical,
  Dashboard,
} from '../types';
import type { NewLocationDefaults } from '../components/inventory/locations/AddLocation';
import type { EditLocationDefaults } from '../components/inventory/locations/EditLocation';
import type { ChemicalDefaults } from '../components/inventory/chemicals/AddChemical';

// Server-side equivalents of what ContainerFilter exposes on the backend
// (see backend/apps/inventory/filters.py) — only the subset Containers.tsx
// actually drives today.
export type ContainerListParams = {
  search?: string;
  checkout_status?: 'in' | 'out';
  ordering?: string;
};

export const getContainers = (params?: ContainerListParams): Promise<Container[] | []> => {
  return apiFetch(`/inventory/containers/${toQueryString(params)}`);
};

export const getChemicalByCas = (cas: string): Promise<CasCheck> => {
  return apiFetch(`/inventory/chemicals/check_cas/?cas=${cas}`);
};

export const getStorageCategories = (): Promise<StorageCategory[]> => {
  return apiFetch(`/inventory/chemical_storage_categories/`);
};

export const getLocations = (): Promise<Location[]> => {
  return apiFetch('/inventory/locations/');
};

export const editLocation = (data: EditLocationDefaults, id: string): Promise<Location> => {
  return apiFetch(`/inventory/locations/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const getLocationContainers = (id: string): Promise<Location> => {
  return apiFetch(`/inventory/locations/${id}/containers`);
};

export const getContainerMetaData = (): Promise<ContainerOptions> => {
  return apiFetch('/inventory/containers/', {
    method: 'OPTIONS',
  });
};

export const submitNewContainerForm = (data: ContainerFormDefaults): Promise<Container> => {
  return apiFetch('/inventory/containers/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const getContainerDetails = (id: string): Promise<Container> => {
  return apiFetch(`/inventory/containers/${id}/`);
};

export const updateContainer = (
  slug: string,
  data: ContainerDetailDefaults
): Promise<Container> => {
  return apiFetch(`/inventory/containers/${slug}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

// For single-field edits (e.g. inline table editing) — same endpoint as
// updateContainer, but typed for DRF's partial=True PATCH (every field
// optional), so callers aren't forced to supply the whole container.
export const patchContainer = (slug: string, data: ContainerPatch): Promise<Container> => {
  return apiFetch(`/inventory/containers/${slug}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

type ContainerValidation = {
  is_discarded?: boolean;
  is_valid?: boolean;
  // Whether the container has a real tare weight to estimate usage from —
  // reported here (rather than a separate call) since WeighIn.tsx already
  // hits this endpoint right after every barcode scan.
  has_estimated_usage?: boolean;
};
export const checkIfDiscarded = (slug: string): Promise<ContainerValidation> => {
  return apiFetch(`/inventory/containers/${slug}/is_discarded/`);
};

export const checkOutContainers = (slugs: string[]): Promise<{ events: CheckoutEvent[] }> => {
  return apiFetch(`/inventory/containers/check_out/`, {
    method: 'POST',
    body: JSON.stringify(slugs),
  });
};

export const checkInContainers = (slugs: string[]): Promise<{ events: CheckoutEvent[] }> => {
  return apiFetch(`/inventory/containers/check_in/`, {
    method: 'POST',
    body: JSON.stringify(slugs),
  });
};

export const checkValidId = (slug: string): Promise<{ is_valid: boolean }> => {
  return apiFetch(`/inventory/containers/${slug}/is_valid/`);
};

// Batch endpoint — records a weight reading and checks in every container
// in `data.checkin` as one atomic request (either all rows save or none do).
export const createWeighIn = (
  data: WeighInDefaults
): Promise<{ readings: WeightReading[]; events: CheckoutEvent[] }> => {
  return apiFetch(`/inventory/containers/weigh_in_bulk/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const getContainerWeighIns = (slug: string): Promise<WeightReading[]> => {
  return apiFetch(`/inventory/containers/${slug}/weigh_in`, {
    method: 'GET',
  });
};

export const addLocation = (data: NewLocationDefaults): Promise<Location> => {
  return apiFetch(`/inventory/locations/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const getLocationTypes = (): Promise<LocationType[]> => {
  return apiFetch(`/inventory/location_types/`);
};

export const getLocationMenu = (): Promise<Location[]> => {
  return apiFetch(`/inventory/locations/menu/`);
};

// Mirrors the subset of ChemicalFilter's search_fields the frontend drives
// today (see backend/apps/inventory/filters.py).
export type ChemicalListParams = {
  search?: string;
};

export const getChemicals = (params?: ChemicalListParams): Promise<Chemical[]> => {
  return apiFetch(`/inventory/chemicals/${toQueryString(params)}`);
};

export const addChemical = (data: ChemicalDefaults): Promise<Chemical> => {
  return apiFetch(`/inventory/chemicals/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const getChemicalById = (id: string): Promise<Chemical> => {
  return apiFetch(`/inventory/chemicals/${id}/`);
};

export const updateChemical = (data: ChemicalDefaults, id: string): Promise<Chemical> => {
  return apiFetch(`/inventory/chemicals/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const deleteLocation = (id: string) => {
  return apiFetch(`/inventory/locations/${id}/`, {
    method: 'DELETE',
  });
};

export const getDashboard = (): Promise<Dashboard> => {
  return apiFetch('/inventory/dashboard');
};

export const transferContainers = (data: {
  containers: { slug: string }[];
  location: string;
}): Promise<Container[]> => {
  return apiFetch(`/inventory/containers/transfer/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const moveLocations = (data: {
  childLocations: { slug: string }[];
  parentLocation: string;
}): Promise<Location[]> => {
  return apiFetch(`/inventory/locations/move/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

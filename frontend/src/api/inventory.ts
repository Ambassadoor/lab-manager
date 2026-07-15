// Various data fetchers
import { apiFetch } from './client';
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

export const getContainers = (): Promise<Container[] | []> => {
  return apiFetch('/inventory/containers/');
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

type TTT = {
  is_discarded?: boolean;
  is_valid?: boolean;
};
export const checkIfDiscarded = (slug: string): Promise<TTT> => {
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

export const getChemicals = (): Promise<Chemical[]> => {
  return apiFetch(`/inventory/chemicals/`);
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

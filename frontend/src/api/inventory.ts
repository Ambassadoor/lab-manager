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
  WeighInDefaults,
  WeightReading,
} from '../types';

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

type TTT = {
  is_discarded?: boolean;
  is_valid?: boolean;
};
export const checkIfDiscarded = (slug: string): Promise<TTT> => {
  return apiFetch(`/inventory/containers/${slug}/is_discarded/`);
};

export const checkOutContainers = (slugs: string[]): Promise<{events: CheckoutEvent[]}> => {
  return apiFetch(`/inventory/containers/check_out/`, {
    method: 'POST',
    body: JSON.stringify(slugs),
  });
};

export const checkInContainers = (slugs: string[]): Promise<{events: CheckoutEvent[]}> => {
  return apiFetch(`/inventory/containers/check_in/`, {
    method: 'POST',
    body: JSON.stringify(slugs),
  });
};

export const checkValidId = (slug: string): Promise<{ is_valid: boolean }> => {
  return apiFetch(`/inventory/containers/${slug}/is_valid/`);
};

export const createWeighIn = (data: WeighInDefaults): Promise<WeightReading> => {
  return apiFetch(`/inventory/containers/${data.slug}/weigh_in/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

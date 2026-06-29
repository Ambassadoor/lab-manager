import { apiFetch } from './client';
import type {
  Container,
  StorageCategory,
  Location,
  CasCheck,
  ContainerOptions,
  ContainerFormDefaults,
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

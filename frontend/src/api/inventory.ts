import { apiFetch } from './client';
import type { Chemical, Container, StorageCategory, Location } from '../types';

export const getContainers = (): Promise<Container[] | []> => {
  return apiFetch('/inventory/containers/');
};

export const getChemicalByCas = (cas: string): Promise<{mixtures: Chemical[], chemicals: Chemical[]}> => {
  return apiFetch(`/inventory/chemicals/check_cas/?cas=${cas}`)
}

export const getStorageCategories = (): Promise<StorageCategory[]> => {
  return apiFetch(`/inventory/chemical_storage_categories/`)
}

export const getLocations = (): Promise<Location[]> => {
  return apiFetch('/inventory/locations/')
}

export const getContainerMetaData = () => {
  return apiFetch('/inventory/containers/', {
    method: "OPTIONS"
  })
}
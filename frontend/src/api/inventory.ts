import { apiFetch } from './client';
import type { Chemical, Container } from '../types';

export const getContainers = (): Promise<Container[] | []> => {
  return apiFetch('/inventory/containers/');
};

export const getChemicalByCas = (cas: string): Promise<{mixtures: Chemical[], chemicals: Chemical[]}> => {
  return apiFetch(`/inventory/chemicals/check_cas?cas=${cas}`)
}

export const getStorageCategories = () => {
  return apiFetch(`/inventory/chemical_storage_categories/`)
}
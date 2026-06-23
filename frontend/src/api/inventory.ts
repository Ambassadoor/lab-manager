import { apiFetch } from './client';
import type { Chemical, Container } from '../types';

export const getContainers = (): Promise<Container[] | []> => {
  return apiFetch('/inventory/containers/');
};

export const getChemicalByCas = (cas: string): Promise<Chemical[] | []> => {
  return apiFetch(`/inventory/chemicals?cas=${cas}`)
}
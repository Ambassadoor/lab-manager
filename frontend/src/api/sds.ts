// SDS data fetchers. Mirrors the shape of api/inventory.ts's fetchers, with
// one difference: createSds sends a FormData body (a real file upload),
// unlike every other write in this app — see client.ts's isFormData handling.
import { apiFetch, toQueryString } from './client';
import type { SDS } from '../types';

// Mirrors the subset of SDSFilter the frontend drives (see
// backend/apps/inventory/filters.py) — `search` alone covers Chemical name,
// CAS #, Product #, and Chem-ID at once (SdsSearch.tsx); the rest scope a
// lookup to one container/chemical, or suggest an existing document by
// manufacturer + product # (SdsUploadDialog.tsx).
export type SdsListParams = {
  search?: string;
  container?: number | string;
  chemical?: number | string;
  manufacturer?: string;
  product_num?: string;
};

export const getSdsList = (params?: SdsListParams): Promise<SDS[]> => {
  return apiFetch(`/inventory/sds/${toQueryString(params)}`);
};

export const getSdsById = (id: number | string): Promise<SDS> => {
  return apiFetch(`/inventory/sds/${id}/`);
};

// Exactly one of `file` (upload a new document) / `existingSdsId` (attach a
// document already on file, avoiding a duplicate Drive upload) is required —
// matches SDSWriteSerializer.validate() on the backend.
export type CreateSdsInput = {
  container: number | string;
  file?: File;
  existingSdsId?: number | string;
  revisionDate?: string | null;
  revisionNumber?: number | string;
  ghsPictograms?: string[];
};

// Same shape as CreateSdsInput minus `container` — used when the container
// doesn't exist yet (ContainerForm), so a selection has to be staged
// locally and turned into a real createSds call once a real container id
// exists. See SdsUploadDialog's `onSelect` (deferred) mode.
export type PendingSdsSelection = Omit<CreateSdsInput, 'container'>;

export const createSds = (input: CreateSdsInput): Promise<SDS> => {
  const formData = new FormData();
  formData.set('container', String(input.container));
  if (input.file) formData.set('file', input.file);
  if (input.existingSdsId !== undefined) {
    formData.set('existing_sds', String(input.existingSdsId));
  }
  if (input.revisionDate) formData.set('revision_date', input.revisionDate);
  if (input.revisionNumber !== undefined && input.revisionNumber !== '') {
    formData.set('revision_number', String(input.revisionNumber));
  }
  input.ghsPictograms?.forEach((pictogram) => formData.append('ghs_pictograms', pictogram));

  return apiFetch('/inventory/sds/', {
    method: 'POST',
    body: formData,
  });
};

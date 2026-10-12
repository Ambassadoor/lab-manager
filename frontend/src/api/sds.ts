// SDS data fetchers. Mirrors the shape of api/inventory.ts's fetchers, with
// one difference: createSds sends a FormData body (a real file upload),
// unlike every other write in this app — see client.ts's isFormData handling.
import { apiFetch, toQueryString } from './client';
import type { SDS } from '../types';

// Mirrors the subset of SDSFilter the frontend drives (see
// backend/apps/inventory/filters.py) — `search` alone covers Chemical name,
// CAS #, Product #, and Chem-ID at once (SdsSearch.tsx); the rest scope a
// lookup to one container/chemical, suggest an existing document by
// chemical + manufacturer/product # (product # a refiner, not required —
// one SDS often covers many product numbers), or catch a likely duplicate
// by chemical + exact revision date/# (SdsUploadDialog.tsx, both).
export type SdsListParams = {
  search?: string;
  // Every row sharing one Drive file (one document on several containers)
  drive_id?: string;
  container?: number | string;
  chemical?: number | string;
  manufacturer?: string;
  product_num?: string;
  revision_date?: string;
  revision_number?: number | string;
  ordering?: string;
};

// Newest first, the same order as the backend's SDS.NEWEST_FIRST, which
// picks a container's "Latest SDS".
export const NEWEST_SDS_FIRST = '-revision_date,-revision_number,-id';

export const getSdsList = (params?: SdsListParams): Promise<SDS[]> => {
  return apiFetch(`/api/inventory/sds/${toQueryString(params)}`);
};

export const getSdsById = (id: number | string): Promise<SDS> => {
  return apiFetch(`/api/inventory/sds/${id}/`);
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

// FormData for a document selection: a new `file`, or an `existing_sds` to
// reuse, plus revision fields. Shared by createSds and replaceSds.
function selectionFormData(input: PendingSdsSelection): FormData {
  const formData = new FormData();
  if (input.file) formData.set('file', input.file);
  if (input.existingSdsId !== undefined) {
    formData.set('existing_sds', String(input.existingSdsId));
  }
  if (input.revisionDate) formData.set('revision_date', input.revisionDate);
  if (input.revisionNumber !== undefined && input.revisionNumber !== '') {
    formData.set('revision_number', String(input.revisionNumber));
  }
  input.ghsPictograms?.forEach((pictogram) => formData.append('ghs_pictograms', pictogram));
  return formData;
}

export const createSds = (input: CreateSdsInput): Promise<SDS> => {
  const formData = selectionFormData(input);
  formData.set('container', String(input.container));
  return apiFetch('/api/inventory/sds/', {
    method: 'POST',
    body: formData,
  });
};

// "Wrong SDS on this container": points this one SDS row at another
// document (existing or newly uploaded); other containers sharing the old
// one keep it.
export const replaceSds = (id: number, selection: PendingSdsSelection): Promise<SDS> => {
  return apiFetch(`/api/inventory/sds/${id}/replace/`, {
    method: 'POST',
    body: selectionFormData(selection),
  });
};

export type SdsCorrection = {
  revisionDate: string | null;
  revisionNumber: string;
  ghsPictograms: string[];
  // The right PDF, replacing the file's content in place
  file?: File;
};

// "Fix this document": corrects every SDS row sharing this one's Drive
// file. JSON unless there's a file, so an emptied pictogram list still
// clears them (a multipart form can't send an empty list).
export const correctSds = (id: number, correction: SdsCorrection): Promise<SDS> => {
  const fields = {
    revision_date: correction.revisionDate,
    revision_number: correction.revisionNumber || null,
    ghs_pictograms: correction.ghsPictograms,
  };
  if (!correction.file) {
    return apiFetch(`/api/inventory/sds/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
  }
  const formData = new FormData();
  formData.set('file', correction.file);
  if (fields.revision_date) formData.set('revision_date', fields.revision_date);
  if (fields.revision_number) formData.set('revision_number', fields.revision_number);
  fields.ghs_pictograms.forEach((p) => formData.append('ghs_pictograms', p));
  return apiFetch(`/api/inventory/sds/${id}/`, { method: 'PATCH', body: formData });
};

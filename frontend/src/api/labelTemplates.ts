// Django-backed CRUD for the label template registry (see
// bridge/PRINTER_PLAN.md's "template registry" TODO) — distinct from
// api/bridge.ts, which only talks to the local hardware bridge.
import { apiFetch, toQueryString } from './client';
import type {
  LabelTemplate,
  LabelTemplateKind,
  LabelTemplatePatch,
  LabelTemplateWrite,
} from '../types';

export type LabelTemplateListParams = {
  kind?: LabelTemplateKind;
};

export const getLabelTemplates = (params?: LabelTemplateListParams): Promise<LabelTemplate[]> => {
  return apiFetch(`/inventory/label_templates/${toQueryString(params)}`);
};

export const createLabelTemplate = (data: LabelTemplateWrite): Promise<LabelTemplate> => {
  return apiFetch('/inventory/label_templates/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateLabelTemplate = (
  id: number,
  data: LabelTemplateWrite
): Promise<LabelTemplate> => {
  return apiFetch(`/inventory/label_templates/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const patchLabelTemplate = (
  id: number,
  data: LabelTemplatePatch
): Promise<LabelTemplate> => {
  return apiFetch(`/inventory/label_templates/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const deleteLabelTemplate = (id: number): Promise<void> => {
  return apiFetch(`/inventory/label_templates/${id}/`, {
    method: 'DELETE',
  });
};

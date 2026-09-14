import type { PrintParams } from '../../types';

// Template numbers and field names are hardcoded here rather than looked
// up anywhere — see bridge/PRINTER_PLAN.md's "template registry" TODO for
// why (no DB-backed mapping yet, printer.py can only select a template by
// its assigned number). One place to update instead of duplicating these
// across every call site that prints a container/location label.
export const containerLabelPrintParams = (container: { label: string }): PrintParams => ({
  template: 1,
  fields: { Barcode1: JSON.stringify({ id: container.label }), Text1: container.label },
  copies: 1,
});

export const locationLabelPrintParams = (location: { id: number }): PrintParams => ({
  template: 3,
  fields: { Barcode: JSON.stringify({ id: location.id }), Text: `Loc-${location.id}` },
  copies: 1,
});

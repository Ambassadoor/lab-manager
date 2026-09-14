import { getPrinterStatus, printLabelChecked } from '../../api/bridge';
import { getLabelTemplates } from '../../api/labelTemplates';
import type { LabelFieldRole, LabelTemplateKind, PrintConfirmation } from '../../types';

// Resolves which registered LabelTemplate to use for `kind` by matching the
// printer's *currently loaded* media width (see bridge/PRINTER_PLAN.md's
// "template registry" TODO for why this can't just be a hardcoded template
// number/field-name map anymore, and why auto-matching by loaded media was
// chosen over asking the user to pick a size at print time), then prints it
// with `values` mapped onto whichever object name each role is registered
// under for that template.
async function resolveAndPrint(
  kind: LabelTemplateKind,
  values: Partial<Record<LabelFieldRole, string>>
): Promise<PrintConfirmation> {
  const [status, templates] = await Promise.all([getPrinterStatus(), getLabelTemplates({ kind })]);

  const match = templates.find((t) => t.media_width_mm === status.media_width_mm);
  if (!match) {
    throw new Error(
      `No ${kind} label template is registered for the currently loaded ${status.media_width_mm}mm media. ` +
        'Register one, or load media matching an existing template.'
    );
  }

  const fields: Record<string, string> = {};
  for (const field of match.fields) {
    const value = values[field.role];
    if (value !== undefined) fields[field.object_name] = value;
  }

  return printLabelChecked({ template: match.template_number, fields, copies: 1 });
}

export const printContainerLabel = (container: { label: string }): Promise<PrintConfirmation> =>
  resolveAndPrint('container', {
    barcode: JSON.stringify({ id: container.label }),
    text: container.label,
  });

export const printLocationLabel = (location: { id: number }): Promise<PrintConfirmation> =>
  resolveAndPrint('location', {
    barcode: JSON.stringify({ id: location.id }),
    text: `Loc-${location.id}`,
  });

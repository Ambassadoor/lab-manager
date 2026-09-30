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

// `path` is the location's names from the root down, ending with its own.
export type LocationLabelTarget = { id: number; path: string[] };

// How many trailing path levels go on the label — the full path from the
// building down rarely fits the tape, and the last few levels are what
// someone standing at the shelf actually needs to recognize it.
const LABEL_PATH_LEVELS = 3;

// "\n" becomes a line break on the printed label (the bridge converts it
// to the printer's own line-break code).
export const locationLabelText = ({ id, path }: LocationLabelTarget): string => {
  const shown = path.slice(-LABEL_PATH_LEVELS);
  const truncated = shown.length < path.length ? '... > ' : '';
  return `${truncated}${shown.join(' > ')}\nLoc-${id}`;
};

export const printLocationLabel = (location: LocationLabelTarget): Promise<PrintConfirmation> =>
  resolveAndPrint('location', {
    barcode: JSON.stringify({ id: `LOC-${location.id}` }),
    text: locationLabelText(location),
  });

// One at a time, in order — the printer processes one job at a time
// anyway, and stopping at the first failure means a problem like running
// out of tape doesn't turn into a pile of failed jobs.
export const printLocationLabels = async (
  locations: LocationLabelTarget[]
): Promise<PrintConfirmation> => {
  let result: PrintConfirmation = { printed: true };
  for (const [i, location] of locations.entries()) {
    try {
      result = await printLocationLabel(location);
    } catch (e) {
      if (i === 0) throw e;
      const message = e instanceof Error ? e.message : 'Unknown error';
      throw new Error(`${message} (${i} of ${locations.length} printed before the failure)`, {
        cause: e,
      });
    }
  }
  return result;
};

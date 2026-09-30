import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createLabelTemplate, updateLabelTemplate } from '../../api/labelTemplates';
import { labelTemplateKeys } from '../../api/queryKeys';
import type { LabelTemplate, LabelTemplateWrite } from '../../types';

const KIND_OPTIONS: { value: LabelTemplateWrite['kind']; label: string }[] = [
  { value: 'container', label: 'Container' },
  { value: 'location', label: 'Location' },
];

// The TZe/HGe widths this printer actually takes — see
// bridge/PRINTER_PLAN.md and LabelTemplate.MEDIA_WIDTH_CHOICES on the
// backend, which this mirrors by hand (same tradeoff already accepted for
// Role/roles.ts elsewhere in this app).
const MEDIA_WIDTH_OPTIONS = [6, 9, 12, 18, 24, 36] as const;

type FormValues = {
  name: string;
  kind: LabelTemplateWrite['kind'];
  template_number: string;
  media_width_mm: string;
  barcode_object_name: string;
  text_object_name: string;
};

const defaultsFor = (template?: LabelTemplate): FormValues => ({
  name: template?.name ?? '',
  kind: template?.kind ?? 'container',
  template_number: template ? String(template.template_number) : '',
  media_width_mm: template ? String(template.media_width_mm) : '',
  barcode_object_name: template?.fields.find((f) => f.role === 'barcode')?.object_name ?? '',
  text_object_name: template?.fields.find((f) => f.role === 'text')?.object_name ?? '',
});

type LabelTemplateDialogProps = {
  open: boolean;
  onClose: () => void;
  // Undefined = create mode. Present = edit mode, pre-filled from it.
  template?: LabelTemplate;
};

// One dialog for both create and edit — the fields are identical either
// way, only the mutation (and its default values) differ.
export const LabelTemplateDialog = ({ open, onClose, template }: LabelTemplateDialogProps) => {
  const qc = useQueryClient();

  const { control, handleSubmit, reset, clearErrors } = useForm<FormValues>({
    mode: 'onBlur',
    values: defaultsFor(template),
  });

  const mutation = useMutation({
    mutationFn: (data: LabelTemplateWrite) =>
      template ? updateLabelTemplate(template.id, data) : createLabelTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labelTemplateKeys.all });
      handleClose();
    },
  });

  const handleClose = () => {
    mutation.reset();
    reset();
    onClose();
  };

  const onSubmit = (data: FormValues) => {
    const fields: LabelTemplateWrite['fields'] = [];
    if (data.barcode_object_name.trim()) {
      fields.push({ role: 'barcode', object_name: data.barcode_object_name.trim() });
    }
    if (data.text_object_name.trim()) {
      fields.push({ role: 'text', object_name: data.text_object_name.trim() });
    }
    mutation.mutate({
      name: data.name.trim(),
      kind: data.kind,
      template_number: Number(data.template_number),
      media_width_mm: Number(data.media_width_mm) as LabelTemplateWrite['media_width_mm'],
      fields,
    });
  };

  return (
    <Dialog
      open={open}
      component="form"
      onSubmit={handleSubmit(onSubmit)}
      onClose={mutation.isPending ? undefined : handleClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>{template ? 'Edit Label Template' : 'Add Label Template'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}
          <Controller
            control={control}
            name="name"
            rules={{ required: 'Required' }}
            render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
              <TextField
                {...field}
                label="Name"
                helperText={error?.message ?? "Human-readable, e.g. 'Location label (12mm)'."}
                error={!!error}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <TextField {...field} select label="Kind">
                {KIND_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="template_number"
            rules={{
              required: 'Required',
              min: { value: 1, message: 'Must be between 1 and 99' },
              max: { value: 99, message: 'Must be between 1 and 99' },
              pattern: { value: /^\d+$/, message: 'Whole numbers only' },
            }}
            render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
              <TextField
                {...field}
                type="number"
                label="Template #"
                helperText={
                  error?.message ??
                  'The number this template was assigned in P-touch Transfer Manager (1-99).'
                }
                error={!!error}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="media_width_mm"
            rules={{ required: 'Required' }}
            render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
              <TextField
                {...field}
                select
                label="Media width"
                helperText={error?.message}
                error={!!error}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
              >
                {MEDIA_WIDTH_OPTIONS.map((w) => (
                  <MenuItem key={w} value={w}>
                    {w} mm
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Typography variant="subtitle2" color="text.secondary">
            Object names (as set in P-touch Editor)
          </Typography>
          <Controller
            control={control}
            name="barcode_object_name"
            render={({ field }) => (
              <TextField {...field} label="Barcode object" placeholder="e.g. Barcode1" />
            )}
          />
          <Controller
            control={control}
            name="text_object_name"
            render={({ field }) => (
              <TextField {...field} label="Text object" placeholder="e.g. Text1" />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="submit" loading={mutation.isPending}>
          Save
        </Button>
        <Button onClick={handleClose} disabled={mutation.isPending}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

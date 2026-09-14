import { Add, Delete, Edit } from '@mui/icons-material';
import { Alert, Box, Container, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ColDef } from 'ag-grid-community';
import { type CustomCellRendererProps } from 'ag-grid-react';
import { useState } from 'react';
import { deleteLabelTemplate, getLabelTemplates } from '../../api/labelTemplates';
import { labelTemplateKeys } from '../../api/queryKeys';
import { DataTable } from '../shared/DataTable';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useConfirmDialog } from '../shared/useConfirmDialog';
import type { LabelTemplate } from '../../types';
import { LabelTemplateDialog } from './LabelTemplateDialog';

const KIND_LABELS: Record<LabelTemplate['kind'], string> = {
  container: 'Container',
  location: 'Location',
};

// Actions column's cellRenderer — reads onEdit/onDelete from
// cellRendererParams (set from the parent's own state setters below)
// rather than owning anything itself, same reasoning as Containers.tsx's
// PrintCellRenderer for why this isn't a per-row mutation.
type ActionsCellRendererProps = CustomCellRendererProps<LabelTemplate> & {
  onEdit: (template: LabelTemplate) => void;
  onDelete: (template: LabelTemplate) => void;
};

const ActionsCellRenderer = ({ data, onEdit, onDelete }: ActionsCellRendererProps) => {
  if (!data) return null;
  return (
    <Stack direction="row">
      <Tooltip title="Edit">
        <IconButton size="small" onClick={() => onEdit(data)}>
          <Edit fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton size="small" onClick={() => onDelete(data)}>
          <Delete fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
};

// Admin/Lab Manager-only — App.tsx's RequireRole keeps anyone else from
// landing here, matching the backend's own role_at_least(LAB_MANAGER) gate
// on LabelTemplateView's write actions (reads are open to any authenticated
// role, since the print flow itself needs to look these up).
export const LabelTemplates = () => {
  const qc = useQueryClient();

  const {
    data: templates,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: labelTemplateKeys.list(),
    queryFn: () => getLabelTemplates(),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LabelTemplate | undefined>(undefined);
  const deleteConfirm = useConfirmDialog<LabelTemplate>();

  const deleteMutation = useMutation({
    mutationFn: (template: LabelTemplate) => deleteLabelTemplate(template.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labelTemplateKeys.all });
      deleteConfirm.cancel();
    },
  });

  const [colDefs] = useState<ColDef<LabelTemplate>[]>([
    { field: 'name' },
    {
      field: 'kind',
      valueFormatter: (p) => (p.value ? KIND_LABELS[p.value as LabelTemplate['kind']] : ''),
    },
    { field: 'template_number', headerName: 'Template #' },
    {
      field: 'media_width_mm',
      headerName: 'Media Width',
      valueFormatter: (p) => (p.value != null ? `${p.value} mm` : ''),
    },
    {
      colId: 'barcode_object',
      headerName: 'Barcode Object',
      valueGetter: (p) => p.data?.fields.find((f) => f.role === 'barcode')?.object_name ?? '—',
      sortable: false,
      filter: false,
    },
    {
      colId: 'text_object',
      headerName: 'Text Object',
      valueGetter: (p) => p.data?.fields.find((f) => f.role === 'text')?.object_name ?? '—',
      sortable: false,
      filter: false,
    },
    {
      colId: 'actions',
      headerName: '',
      cellRenderer: ActionsCellRenderer,
      cellRendererParams: {
        onEdit: (template: LabelTemplate) => {
          setEditing(template);
          setDialogOpen(true);
        },
        onDelete: (template: LabelTemplate) => deleteConfirm.request(template),
      },
      sortable: false,
      filter: false,
      maxWidth: 100,
    },
  ]);

  return (
    <Container maxWidth={false}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={2}>
            <Typography variant="h4">Label Templates</Typography>
            <Tooltip title="Add template">
              <IconButton
                onClick={() => {
                  setEditing(undefined);
                  setDialogOpen(true);
                }}
              >
                <Add />
              </IconButton>
            </Tooltip>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Templates already transferred onto the printer via P-touch Transfer Manager, registered
            here so the app knows which one to use for a given label kind and media size.
          </Typography>
        </Box>
      </Stack>
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : 'Failed to load label templates.'}
        </Alert>
      )}
      <Box>
        <DataTable<LabelTemplate>
          rowData={templates}
          columnDefs={colDefs}
          isLoading={isPending}
          getRowId={(p) => String(p.data.id)}
        />
      </Box>
      <LabelTemplateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        template={editing}
      />
      <ConfirmDialog
        open={deleteConfirm.isOpen}
        title="Delete label template"
        message={
          deleteConfirm.target &&
          `Delete "${deleteConfirm.target.name}"? Anything printing this label kind at ${deleteConfirm.target.media_width_mm}mm will stop working until another template is registered for it.`
        }
        confirmLabel="Delete"
        confirmColor="error"
        loading={deleteMutation.isPending}
        error={deleteMutation.isError ? deleteMutation.error.message : null}
        onCancel={() => {
          deleteMutation.reset();
          deleteConfirm.cancel();
        }}
        onConfirm={() => {
          if (deleteConfirm.target) deleteMutation.mutate(deleteConfirm.target);
        }}
      />
    </Container>
  );
};

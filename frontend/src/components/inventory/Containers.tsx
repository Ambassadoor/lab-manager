import {
  Alert,
  Box,
  Container,
  Drawer,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useMemo, useState } from 'react';
import { getContainers, patchContainer } from '../../api/inventory';
import { containerKeys } from '../../api/queryKeys';
import {
  type CellValueChangedEvent,
  type ColDef,
  type GetRowIdParams,
  type RowSelectionOptions,
} from 'ag-grid-community';
import { ContainerDetail } from './ContainerDetail';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../shared/DataTable';
import type { Container as ContainerType, ContainerPatch, EditableKeys } from '../../types';
import { AddBox } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

//TODO: Remove container data logic outside and let parent components pass in values
export const Containers = () => {
  const {
    isPending,
    isError,
    error,
    data: containers,
  } = useQuery({
    queryKey: containerKeys.list(),
    queryFn: getContainers,
  });

  const [open, setOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ContainerType | undefined>(undefined);
  const [editError, setEditError] = useState<string | null>(null);
  const [colDefs] = useState<ColDef<ContainerType>[]>([
    { field: 'label', headerName: 'ID', filter: true },
    { field: 'name', filter: true },
    { field: 'location.full_path', headerName: 'Location', filter: true },
    { field: 'manufacturer' satisfies EditableKeys<ContainerType>, editable: true },
    { field: 'quantity' },
    {
      field: 'product_num' satisfies EditableKeys<ContainerType>,
      headerName: 'Product #',
      editable: true,
    },
    { field: 'is_opened', headerName: 'Opened?' },
  ]);

  const rowSelection = useMemo<RowSelectionOptions>(() => {
    return {
      mode: 'multiRow',
    };
  }, []);

  const getRowId = useCallback((params: GetRowIdParams<ContainerType>) => params.data.label, []);

  const qc = useQueryClient();
  const patchMutation = useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: ContainerPatch }) =>
      patchContainer(slug, data),
    onError: (err) => {
      setEditError(err instanceof Error ? err.message : 'Failed to save edit.');
    },
    // Re-syncs the grid to server truth either way — confirms a successful
    // edit, or reverts an optimistic one the grid already applied on failure.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: containerKeys.list() });
    },
  });

  const onCellValueChanged = (event: CellValueChangedEvent<ContainerType>) => {
    const field = event.colDef.field as EditableKeys<ContainerType> & string;
    if (!field || event.newValue === event.oldValue) return;
    patchMutation.mutate({
      slug: event.data.slug,
      data: { [field]: event.newValue } as ContainerPatch,
    });
  };

  const navigate = useNavigate();

  return (
    <Container>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">Containers</Typography>
          <Typography variant="body2" color="text.secondary">
            Browse and edit containers in inventory.
          </Typography>
        </Box>
        <Tooltip title="Add container">
          <IconButton
            onClick={() => {
              navigate('new');
              setOpen(true);
            }}
          >
            <AddBox />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box>
        <DataTable<ContainerType>
          rowData={containers}
          columnDefs={colDefs}
          rowSelection={rowSelection}
          pageSize={50}
          getRowId={getRowId}
          isLoading={isPending}
          isError={isError}
          errorMessage={error instanceof Error ? error.message : undefined}
          singleClickEdit
          onCellDoubleClicked={(e) => {
            if (!e.data) return;
            setSelectedRow(e.data);
            setOpen(true);
          }}
          onCellValueChanged={onCellValueChanged}
        />
      </Box>
      <Drawer open={open} onClose={() => setOpen((prev) => !prev)} anchor="right">
        <ContainerDetail data={selectedRow} />
      </Drawer>
      <Snackbar open={!!editError} autoHideDuration={6000} onClose={() => setEditError(null)}>
        <Alert severity="error" onClose={() => setEditError(null)}>
          {editError}
        </Alert>
      </Snackbar>
    </Container>
  );
};

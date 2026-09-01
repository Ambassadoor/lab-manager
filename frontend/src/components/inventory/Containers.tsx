import {
  Alert,
  Box,
  Button,
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
import { useNavigate, useSearchParams } from 'react-router-dom';

// The three dashboard-card slices "View More" can land here with, via
// ?view=. Mirrors the same predicates DashboardView computes server-side
// (see backend/apps/inventory/views/dashboard.py) — applied client-side
// against the already-fetched, unbounded container list instead of a
// dedicated endpoint, since every field they key off is already present on
// ContainerSerializer's output.
export type ContainersViewKey = 'recently_added' | 'restock_soon' | 'checked_out';

const VIEW_LABELS: Record<ContainersViewKey, string> = {
  recently_added: 'Recently Added',
  restock_soon: 'Restock Soon',
  checked_out: 'Checked Out',
};

function isContainersViewKey(value: string | null): value is ContainersViewKey {
  return value === 'recently_added' || value === 'restock_soon' || value === 'checked_out';
}

function filterByView(containers: ContainerType[], view: ContainersViewKey | null) {
  switch (view) {
    case 'restock_soon':
      return containers.filter(
        (c) => c.percent_remaining != null && Number(c.percent_remaining) <= 10
      );
    case 'checked_out':
      return containers.filter((c) => c.checkout_status?.action === 'out');
    case 'recently_added':
      // date_received is an ISO "YYYY-MM-DD" string — safe to sort lexically.
      return containers
        .filter((c) => c.date_received)
        .sort((a, b) => (a.date_received! < b.date_received! ? 1 : -1));
    default:
      return containers;
  }
}

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

  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view = isContainersViewKey(viewParam) ? viewParam : null;
  const filteredContainers = useMemo(
    () => (containers ? filterByView(containers, view) : containers),
    [containers, view]
  );

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
    <Container maxWidth={false}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
        <Box>
          <Stack direction={'row'} spacing={2}>
            <Typography variant="h4">Containers</Typography>
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
          <Typography variant="body2" color="text.secondary">
            Browse and edit containers in inventory.
          </Typography>
        </Box>
      </Stack>
      {view && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => setSearchParams({})}>
              Clear
            </Button>
          }
        >
          Showing: {VIEW_LABELS[view]}
          {filteredContainers ? ` (${filteredContainers.length})` : ''}
        </Alert>
      )}
      <Box>
        <DataTable<ContainerType>
          rowData={filteredContainers}
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
        <ContainerDetail data={selectedRow} onClose={() => setOpen(false)} />
      </Drawer>
      <Snackbar open={!!editError} autoHideDuration={6000} onClose={() => setEditError(null)}>
        <Alert severity="error" onClose={() => setEditError(null)}>
          {editError}
        </Alert>
      </Snackbar>
    </Container>
  );
};

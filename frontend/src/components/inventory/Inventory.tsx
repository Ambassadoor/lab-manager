import {
  Alert,
  Box,
  Button,
  Container,
  Drawer,
  FormControlLabel,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getContainers, patchContainer, type ContainerListParams } from '../../api/inventory';
import { containerKeys, printerKeys } from '../../api/queryKeys';
import {
  type CellValueChangedEvent,
  type ColDef,
  type GetRowIdParams,
  type RowSelectionOptions,
} from 'ag-grid-community';
import { type CustomCellRendererProps } from 'ag-grid-react';
import { ContainerDetail } from './ContainerDetail';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../shared/DataTable';
import type { Container as ContainerType, ContainerPatch, EditableKeys } from '../../types';
import { AddBox, CreateNewFolder, Description, Print, UploadFile } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { hasRoleAtLeast } from '../shared/roles';
import { SdsUploadDialog } from '../sds/SdsUploadDialog';
import { PrintResultSnackbar } from '../shared/PrintResultSnackbar';
import { printContainerLabel } from '../shared/printTemplates';
import { PageHeader } from '../shared/PageHeader';
import { useIsPhone } from '../shared/useIsPhone';
import { LocationTree } from './locations/LocationTree';

// The three dashboard-card slices "View More" can land here with, via
// ?view=. `checked_out` and `recently_added` translate straight to backend
// query params (see listParams below); `restock_soon` is the one exception —
// it keys off percent_remaining, a SerializerMethodField computed from tare
// weight/density/quantity-unit rather than a real column or annotation, so
// it's still filtered here against the fetched list. Mirrors the same
// predicates DashboardView computes server-side (see
// backend/apps/inventory/views/dashboard.py).
export type ContainersViewKey = 'recently_added' | 'restock_soon' | 'checked_out';

const VIEW_LABELS: Record<ContainersViewKey, string> = {
  recently_added: 'Recently Added',
  restock_soon: 'Restock Soon',
  checked_out: 'Checked Out',
};

function isContainersViewKey(value: string | null): value is ContainersViewKey {
  return value === 'recently_added' || value === 'restock_soon' || value === 'checked_out';
}

// The only client-side filtering left once `checked_out`/`recently_added`
// move to real backend query params (see listParams in Containers below).
function filterByView(containers: ContainerType[], view: ContainersViewKey | null) {
  switch (view) {
    case 'restock_soon':
      return containers.filter((c) => c.percent_remaining != null && c.percent_remaining <= 10);
    case 'recently_added':
      // The backend already orders by -date_received, but Postgres sorts
      // NULLs *first* on a DESC order — so a container with no
      // date_received would otherwise show up at the very top instead of
      // being excluded.
      return containers.filter((c) => c.date_received);
    default:
      return containers;
  }
}

// The SDS column's cellRenderer — a real component (not a plain render
// function like formulaCellRenderer in Chemicals.tsx) since it needs its
// own hooks: per-row upload-dialog state, and its own role check (rows
// render independently of the table's own canEdit closure).
const SdsCellRenderer = (params: CustomCellRendererProps<ContainerType>) => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const container = params.data;
  if (!container) return null;

  if (container.latest_sds) {
    const sdsId = container.latest_sds.id;
    return (
      <Tooltip title="View SDS">
        <IconButton size="small" onClick={() => navigate(`/sds/${sdsId}`)}>
          <Description fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  if (!canEdit) {
    return (
      <Typography variant="body2" color="text.secondary">
        None on file
      </Typography>
    );
  }

  return (
    <>
      <Tooltip title="Upload SDS">
        <IconButton size="small" onClick={() => setOpen(true)}>
          <UploadFile fontSize="small" />
        </IconButton>
      </Tooltip>
      <SdsUploadDialog
        open={open}
        setOpen={setOpen}
        containerId={container.id}
        chemicalId={container.chemical}
        manufacturer={container.manufacturer}
        productNum={container.product_num}
      />
    </>
  );
};

// The print column's cellRenderer — unlike SdsCellRenderer, it doesn't own
// a mutation itself: one print at a time, one snackbar for whichever row
// triggered it, same reasoning as LocationTree's. `onPrint`
// comes from the parent's cellRendererParams instead.
type PrintCellRendererProps = CustomCellRendererProps<ContainerType> & {
  onPrint: (container: ContainerType) => void;
};

const PrintCellRenderer = ({ data, onPrint }: PrintCellRendererProps) => {
  const { user } = useAuth();
  if (!data || !hasRoleAtLeast(user, 'stockroom')) return null;

  return (
    <Tooltip title="Print label">
      <IconButton size="small" onClick={() => onPrint(data)}>
        <Print fontSize="small" />
      </IconButton>
    </Tooltip>
  );
};

// What a phone has room for. Not the location: three columns cut the IDs
// short, and the tree's header above already says where you are.
const PHONE_COLUMNS = ['label', 'name'];

// The inventory: the location tree beside every container in the selected
// location (and the locations under it), searchable, editable in place,
// with SDS and label actions. Replaces the separate Containers and
// Locations pages; /inventory/containers and /inventory/locations redirect
// here (App.tsx).
export const Inventory = () => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');

  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view = isContainersViewKey(viewParam) ? viewParam : null;
  // Selection lives in the URL (?location=<id>), so a location can be
  // linked to, scanned to, and survives back/forward. '' is all locations.
  const selectedLocation = searchParams.get('location') ?? '';
  const setSelectedLocation = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('location', id);
      else next.delete('location');
      return next;
    });
    // The previewed container likely isn't in the new location's list
    setPreviewSlug(null);
  };
  const [addRootOpen, setAddRootOpen] = useState(false);

  // Local (not URL) state — kept independent of `?view=` so the banner's
  // "Clear" button below only clears the view, not an in-progress search.
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Discarded containers are hidden unless asked for, and then shown alone
  const [discardedOnly, setDiscardedOnly] = useState(false);

  const listParams: ContainerListParams = useMemo(() => {
    const params: ContainerListParams = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (view === 'checked_out') params.checkout_status = 'out';
    if (view === 'recently_added') params.ordering = '-date_received';
    if (discardedOnly) params.is_discarded = true;
    if (selectedLocation) params.in_location = Number(selectedLocation);
    return params;
  }, [debouncedSearch, view, discardedOnly, selectedLocation]);

  const {
    isPending,
    isError,
    error,
    data: containers,
  } = useQuery({
    queryKey: containerKeys.list(listParams),
    queryFn: () => getContainers(listParams),
  });

  const filteredContainers = useMemo(
    () => (containers ? filterByView(containers, view) : containers),
    [containers, view]
  );

  // The side drawer (narrower desktops, the iPad) and the preview panel
  // (xl and up, where tree + grid + panel all fit)
  const [open, setOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ContainerType | undefined>(undefined);
  const showPreview = useMediaQuery((theme) => theme.breakpoints.up('xl'));
  // Slug rather than the row, so the preview re-derives from the latest
  // list data after a refetch (e.g. after editing in the panel)
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const previewContainer = previewSlug
    ? filteredContainers?.find((c) => c.slug === previewSlug)
    : undefined;
  const [editError, setEditError] = useState<string | null>(null);

  const qc = useQueryClient();
  // Lifted above the grid (not owned per-row by PrintCellRenderer) — one
  // print at a time, one snackbar for whichever row triggered it, same
  // reasoning as Locations.tsx's recursive tree.
  const printMutation = useMutation({
    mutationFn: printContainerLabel,
    // A print attempt is the one place here the printer's own hardware
    // state (media, errors) is guaranteed to have just changed — refetch
    // the nav bar's status indicator instead of waiting on its own poll.
    onSettled: () => qc.invalidateQueries({ queryKey: printerKeys.status() }),
  });
  const handlePrint = (container: ContainerType) => {
    printMutation.mutate(container);
  };

  const [colDefs] = useState<ColDef<ContainerType>[]>([
    { field: 'label', headerName: 'ID', filter: true },
    { field: 'name', filter: true },
    { field: 'location.full_path', headerName: 'Location', filter: true },
    { field: 'manufacturer' satisfies EditableKeys<ContainerType>, editable: canEdit },
    { field: 'quantity' },
    {
      field: 'product_num' satisfies EditableKeys<ContainerType>,
      headerName: 'Product #',
      editable: canEdit,
    },
    // These three all fit comfortably under 130px, but autoSizeStrategy's
    // fitCellContents (DataTable.tsx) sizes a column to the *widest* thing
    // rendered in any row — is_opened's "Opened?" header text is wider than
    // its own checkbox, and SDS mixes a slim icon button with the longer
    // "None on file" text — so all three need an explicit cap rather than
    // trusting the auto-fit alone.
    { field: 'is_opened', headerName: 'Opened?', maxWidth: 110 },
    {
      field: 'latest_sds',
      headerName: 'SDS',
      cellRenderer: SdsCellRenderer,
      sortable: false,
      filter: false,
      maxWidth: 140,
    },
    {
      colId: 'print',
      headerName: 'Label',
      cellRenderer: PrintCellRenderer,
      cellRendererParams: { onPrint: handlePrint },
      sortable: false,
      filter: false,
      maxWidth: 90,
    },
  ]);

  const rowSelection = useMemo<RowSelectionOptions>(() => {
    return {
      mode: 'multiRow',
    };
  }, []);

  const getRowId = useCallback((params: GetRowIdParams<ContainerType>) => params.data.label, []);

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
  const isPhone = useIsPhone();

  return (
    <Container maxWidth={false}>
      <PageHeader
        title="Inventory"
        subtitle="Browse containers by location, search them, and edit them."
        titleActions={
          canEdit && (
            <>
              <Tooltip title="Add container">
                <IconButton onClick={() => navigate('/inventory/containers/new')}>
                  <AddBox />
                </IconButton>
              </Tooltip>
              <Tooltip title="Add location">
                <IconButton onClick={() => setAddRootOpen(true)}>
                  <CreateNewFolder />
                </IconButton>
              </Tooltip>
            </>
          )
        }
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search containers…' }}
      />
      <FormControlLabel
        sx={{ mt: -2, mb: 1 }}
        control={
          <Switch checked={discardedOnly} onChange={(e) => setDiscardedOnly(e.target.checked)} />
        }
        label="Discarded only"
      />
      {view && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete('view');
                  return next;
                })
              }
            >
              Clear
            </Button>
          }
        >
          Showing: {VIEW_LABELS[view]}
          {filteredContainers ? ` (${filteredContainers.length})` : ''}
        </Alert>
      )}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <LocationTree
          selectedLocation={selectedLocation}
          onSelect={setSelectedLocation}
          onDeleted={(deletedId) =>
            // Reads the latest params at apply time, so this can't clear a
            // different location selected while the delete was in flight
            setSearchParams((prev) => {
              if (prev.get('location') !== deletedId) return prev;
              const next = new URLSearchParams(prev);
              next.delete('location');
              return next;
            })
          }
          addRootOpen={addRootOpen}
          setAddRootOpen={setAddRootOpen}
        />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <DataTable<ContainerType>
            align="start"
            height="75dvh"
            rowData={filteredContainers}
            columnDefs={colDefs}
            rowSelection={rowSelection}
            pageSize={50}
            getRowId={getRowId}
            isLoading={isPending}
            isError={isError}
            errorMessage={error instanceof Error ? error.message : undefined}
            singleClickEdit
            phoneColumns={PHONE_COLUMNS}
            onRowClicked={(e) => {
              if (showPreview && e.data) setPreviewSlug(e.data.slug);
            }}
            onRowOpen={(row) => {
              // Phone: no room for a drawer. xl: the preview panel already
              // shows it, so a double-click goes to its full page.
              if (isPhone || showPreview) {
                navigate(`/inventory/containers/${row.slug}`, { state: row });
                return;
              }
              setSelectedRow(row);
              setOpen(true);
            }}
            onCellValueChanged={onCellValueChanged}
          />
        </Box>
        {showPreview && (
          <Box sx={{ flexShrink: 0, width: '25dvw' }}>
            {previewContainer ? (
              // key: remount per container so an in-progress edit on one
              // doesn't carry over to the next
              <ContainerDetail
                key={previewContainer.slug}
                data={previewContainer}
                elevation={4}
                onClose={() => setPreviewSlug(null)}
              />
            ) : (
              <Paper
                elevation={4}
                sx={{
                  height: '75dvh',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 3,
                }}
              >
                <Typography color="text.secondary" align="center">
                  Select a container to preview it here. Double-click to open its full page.
                </Typography>
              </Paper>
            )}
          </Box>
        )}
      </Stack>
      <Drawer
        open={open}
        onClose={() => setOpen((prev) => !prev)}
        anchor="right"
        // Drop dark mode's elevation overlay so the drawer matches the flat
        // outlined card inside it, instead of showing a lighter band below it
        slotProps={{ paper: { sx: { backgroundImage: 'none' } } }}
      >
        <ContainerDetail data={selectedRow} onClose={() => setOpen(false)} />
      </Drawer>
      <Snackbar open={!!editError} autoHideDuration={6000} onClose={() => setEditError(null)}>
        <Alert severity="error" onClose={() => setEditError(null)}>
          {editError}
        </Alert>
      </Snackbar>
      <PrintResultSnackbar mutation={printMutation} label="Container label" />
    </Container>
  );
};

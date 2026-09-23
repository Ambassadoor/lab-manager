import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteLocation,
  getContainers,
  getLocationContainers,
  getLocations,
} from '../../../api/inventory';
import { locationKeys } from '../../../api/queryKeys';
import {
  Business,
  ExpandLess,
  ExpandMore,
  Inventory,
  Pallet,
  Kitchen,
  AcUnit,
  Shelves,
  DoorSliding,
  MeetingRoom,
  BusinessTwoTone,
  AddBox,
  Edit,
  Delete,
  Print,
  MoreVert,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  CircularProgress,
  Collapse,
  Container,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import type { Container as ContainerType, Location } from '../../../types';
import { useState } from 'react';
import { AddLocation } from './AddLocation';
import { type ColDef } from 'ag-grid-community';
import { EditLocation } from './EditLocation';
import { useAuth } from '../../../context/AuthContext';
import { DataTable } from '../../shared/DataTable';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { printerKeys } from '../../../api/queryKeys';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { useConfirmDialog } from '../../shared/useConfirmDialog';
import { PrintResultSnackbar } from '../../shared/PrintResultSnackbar';
import { printLocationLabel } from '../../shared/printTemplates';
import { hasRoleAtLeast } from '../../shared/roles';

type LocationProps = {
  location: Location;
  parent?: Location;
  // Nesting level, used to indent the row
  depth?: number;
  selectedLocation: string;
  setSelectedLocation: (id: string) => void;
  // Stockroom+ — shows the row actions menu
  canEdit: boolean;
  onRequestDelete: (target: { id: string; name: string }) => void;
  // Lifted to the top-level Locations component (see its own comment) —
  // every row in this recursively-rendered tree calls the same one, so
  // printing two rows in a row doesn't spawn two uncoordinated mutations
  // or snackbars.
  onPrint: (id: number) => void;
};

const iconMap = new Map([
  ['Business', <Business />],
  ['Inventory', <Inventory />],
  ['Pallet', <Pallet />],
  ['Kitchen', <Kitchen />],
  ['AcUnit', <AcUnit />],
  ['Shelves', <Shelves />],
  ['DoorSliding', <DoorSliding />],
  ['MeetingRoom', <MeetingRoom />],
  ['BusinessTwoTone', <BusinessTwoTone />],
]);

const containsLocation = (location: Location, id: string): boolean =>
  String(location.id) === id || location.children.some((c) => containsLocation(c, id));

//Self referencing location component to allow for tiered location listing
const Location = ({
  location,
  parent,
  depth = 0,
  selectedLocation,
  setSelectedLocation,
  canEdit,
  onRequestDelete,
  onPrint,
}: LocationProps) => {
  // Start expanded when the selection (e.g. from a bookmarked ?location= link)
  // is somewhere below this row, so the selected row is actually visible.
  const [expanded, setExpanded] = useState(() =>
    location.children.some((c) => containsLocation(c, selectedLocation))
  );
  const [open, setOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const hasChildren = location.children.length > 0;

  // Row actions live inside the ListItemButton, so they must not also
  // trigger its select handler or its ripple.
  const rowAction = (fn: () => void) => ({
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      fn();
    },
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  });

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // Close the menu before running the action so focus returns to the row
  // and the dialog it opens isn't stacked on top of the menu.
  const menuAction = (fn: () => void) => () => {
    setMenuAnchor(null);
    fn();
  };

  return (
    <>
      <AddLocation id={String(location.id)} open={open} setOpen={setOpen} />
      <EditLocation location={location} parent={parent} open={openEdit} setOpen={setOpenEdit} />
      <ListItemButton
        selected={selectedLocation === String(location.id)}
        onClick={() => setSelectedLocation(String(location.id))}
        sx={{ pl: 2 + depth * 2 }}
      >
        <ListItemIcon sx={{ minWidth: 40 }}>
          {location.type.icon && iconMap.get(location.type.icon)}
        </ListItemIcon>
        <ListItemText primary={location.name} />
        {/* Location add/edit/print/delete are all Stockroom+, so one
            role check covers the whole menu. */}
        {canEdit && (
          <IconButton
            size="small"
            aria-label={`Actions for ${location.name}`}
            aria-haspopup="menu"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(e.currentTarget);
            }}
          >
            <MoreVert fontSize="small" />
          </IconButton>
        )}
        {hasChildren ? (
          <IconButton
            size="small"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            {...rowAction(() => setExpanded((prev) => !prev))}
          >
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        ) : (
          // Keeps names/actions aligned between rows with and without children
          <Box sx={{ width: 34, flexShrink: 0 }} />
        )}
      </ListItemButton>
      {/* Rendered outside the ListItemButton: React events bubble through
          portals along the component tree, so menu clicks placed inside it
          would also select the row. */}
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={menuAction(() => setOpen(true))}>
          <ListItemIcon>
            <AddBox fontSize="small" color="primary" />
          </ListItemIcon>
          <ListItemText>Add child location</ListItemText>
        </MenuItem>
        <MenuItem onClick={menuAction(() => setOpenEdit(true))}>
          <ListItemIcon>
            <Edit fontSize="small" color="info" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={menuAction(() => onPrint(location.id))}>
          <ListItemIcon>
            <Print fontSize="small" color="success" />
          </ListItemIcon>
          <ListItemText>Print label</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={menuAction(() =>
            onRequestDelete({ id: String(location.id), name: location.name })
          )}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {location.children.map((l) => (
              <Location
                key={l.id}
                location={l}
                parent={location}
                depth={depth + 1}
                selectedLocation={selectedLocation}
                setSelectedLocation={setSelectedLocation}
                canEdit={canEdit}
                onRequestDelete={onRequestDelete}
                onPrint={onPrint}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

// Component for viewing/editing locations and their assigned containers
export const Locations = () => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');

  const [open, setOpen] = useState(false);
  // Selection lives in the URL (?location=<id>) rather than local state, so
  // a link to a specific location's container list can be bookmarked/shared
  // and survives back/forward navigation.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedLocation = searchParams.get('location') ?? '';
  const setSelectedLocation = (id: string) => {
    setSearchParams(id ? { location: id } : {});
  };
  const {
    data: locations,
    isPending: isLocationsPending,
    isError: isLocationsError,
    error: locationsError,
  } = useQuery({
    queryKey: locationKeys.list(),
    queryFn: getLocations,
  });

  const qc = useQueryClient();

  // Lifted above the recursive Location tree (rather than one mutation per
  // row) — one print at a time, one snackbar to show its result, regardless
  // of which row in the tree triggered it. See PrintResultSnackbar for why
  // it can watch this mutation directly with no onSuccess/onError here.
  const printMutation = useMutation({
    mutationFn: printLocationLabel,
    // A print attempt is the one place in the app where the printer's own
    // hardware state (media, errors) is guaranteed to have just changed —
    // refetch the nav bar's status indicator instead of waiting up to
    // POLL_INTERVAL_MS for it to notice on its own.
    onSettled: () => qc.invalidateQueries({ queryKey: printerKeys.status() }),
  });
  const handlePrint = (id: number) => {
    printMutation.mutate({ id });
  };

  //Get's all containers for selected location and any child locations
  const { isPending, data: locationContainers } = useQuery({
    queryKey: locationKeys.containers(selectedLocation),
    queryFn: async () => {
      if (selectedLocation.length > 0) {
        const location = await getLocationContainers(selectedLocation);
        return location.containers;
      } else {
        return await getContainers();
      }
    },
  });

  // Tracks which location (if any) is pending a delete confirmation, shared
  // by every row in the recursive tree below.
  const deleteConfirm = useConfirmDialog<{ id: string; name: string }>();

  //Invalidates location data after successful deletion
  const mutation = useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: (_data, deletedId) => {
      // Clear the selection first so the invalidation below refetches
      // containers for '' (getContainers) instead of re-requesting the
      // now-deleted location's containers endpoint (404). Reads the
      // latest search params at apply time (not the value captured when
      // the mutation started) so this can't clear a different location
      // selected while the delete was in flight.
      setSearchParams((prev) => {
        if (prev.get('location') !== deletedId) return prev;
        const next = new URLSearchParams(prev);
        next.delete('location');
        return next;
      });
      // .all — a deleted location can also affect the menu dropdown and any open containers view
      qc.invalidateQueries({
        queryKey: locationKeys.all,
      });
      deleteConfirm.cancel();
    },
  });

  const [colDefs] = useState<ColDef[]>([
    { field: 'label', headerName: 'ID' },
    { field: 'name' },
    { field: 'manufacturer' },
    { field: 'quantity' },
    { field: 'product_num', headerName: 'Product #' },
  ]);

  const navigate = useNavigate();

  return (
    <Container maxWidth={false}>
      <ConfirmDialog
        open={deleteConfirm.isOpen}
        title="Delete location"
        message={
          deleteConfirm.target &&
          `Delete "${deleteConfirm.target.name}"? This also removes any child locations and cannot be undone.`
        }
        confirmLabel="Delete"
        confirmColor="error"
        loading={mutation.isPending}
        error={mutation.isError ? mutation.error.message : null}
        onCancel={() => {
          mutation.reset();
          deleteConfirm.cancel();
        }}
        onConfirm={() => {
          if (deleteConfirm.target) mutation.mutate(deleteConfirm.target.id);
        }}
      />
      <PrintResultSnackbar mutation={printMutation} label="Location label" />
      {isLocationsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {locationsError instanceof Error ? locationsError.message : 'Failed to load locations.'}
        </Alert>
      )}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
        <Box>
          <Stack direction={'row'} spacing={2}>
            <Typography variant="h4">Locations</Typography>
            <AddLocation id={''} open={open} setOpen={setOpen} />
            {canEdit && (
              <Tooltip title="Add root location">
                <IconButton onClick={() => setOpen(true)}>
                  <AddBox />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Browse locations and the containers stored in them.
          </Typography>
        </Box>
      </Stack>
      <Stack direction={'row'} spacing={2}>
        <Paper
          variant="outlined"
          sx={{ flexShrink: 0, width: 360, maxWidth: 500, height: '75dvh', overflowY: 'auto' }}
        >
          {isLocationsPending ? (
            <CircularProgress size={24} sx={{ m: 2 }} />
          ) : (
            <List component="nav" dense>
              {/* Explicit way back to the unfiltered container list */}
              <ListItemButton
                selected={selectedLocation === ''}
                onClick={() => setSelectedLocation('')}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <Inventory />
                </ListItemIcon>
                <ListItemText primary="All locations" />
              </ListItemButton>
              {locations?.map((l) => (
                <Location
                  location={l}
                  key={l.id}
                  selectedLocation={selectedLocation}
                  setSelectedLocation={setSelectedLocation}
                  canEdit={canEdit}
                  onRequestDelete={deleteConfirm.request}
                  onPrint={handlePrint}
                />
              ))}
            </List>
          )}
        </Paper>
        <Box sx={{ flexGrow: 1 }}>
          <DataTable<ContainerType>
            isLoading={isPending}
            rowData={locationContainers}
            columnDefs={colDefs}
            height="75dvh"
            onCellDoubleClicked={(e) => {
              navigate(`/inventory/containers/${e.data?.slug}`, { state: e.data });
            }}
          />
        </Box>
      </Stack>
    </Container>
  );
};

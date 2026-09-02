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
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Collapse,
  Container,
  FormControlLabel,
  Icon,
  IconButton,
  Stack,
  Switch,
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
import { printLabel } from '../../../api/bridge';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { useConfirmDialog } from '../../shared/useConfirmDialog';
import { hasRoleAtLeast } from '../../shared/roles';

type LocationProps = {
  location: Location;
  parent?: Location;
  setSelectedLocation: (id: string) => void;
  editing?: boolean;
  onRequestDelete: (target: { id: string; name: string }) => void;
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

//Self referencing location component to allow for tiered location listing
const Location = ({
  location,
  parent,
  setSelectedLocation,
  editing,
  onRequestDelete,
}: LocationProps) => {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  const handlePrint = (id: number) => {
    printLabel({
      template: 2,
      fields: { QRCode: JSON.stringify({ id: id }), Text: `Loc-${id}` },
      copies: 1,
    });
  };

  return (
    <Container>
      <AddLocation id={String(location.id)} open={open} setOpen={setOpen} />
      <EditLocation
        location={location}
        parent={parent && parent}
        open={openEdit}
        setOpen={setOpenEdit}
      />
      <Stack direction={'row'}>
        {location.children.length > 0 ? (
          <IconButton onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? <ExpandMore /> : <ExpandLess />}
          </IconButton>
        ) : (
          <IconButton disabled>
            <Icon />
          </IconButton>
        )}
        <Stack direction={'row'} spacing={1} sx={{ alignItems: 'center' }}>
          <Stack
            direction={'row'}
            spacing={1}
            component={Button}
            color="inherit"
            variant="outlined"
            onClick={() => setSelectedLocation(String(location.id))}
          >
            <Typography>{location.name}</Typography>
            {location.type.icon && iconMap.get(location.type.icon)}
            {location.children.length > 0 && <Typography>({location.children.length})</Typography>}
          </Stack>
          <ButtonGroup
            variant="contained"
            sx={{
              visibility: editing ? 'visible' : 'hidden',
              pointerEvents: editing ? 'auto' : 'none',
            }}
          >
            <Button onClick={() => setOpen(true)} size="small">
              <AddBox />
            </Button>
            <Button size="small" color="info" onClick={() => setOpenEdit(true)}>
              <Edit />
            </Button>
            <Button size="small" color="success" onClick={() => handlePrint(location.id)}>
              <Print />
            </Button>
            {/* No separate role check here — reaching this row's ButtonGroup
                at all already requires Stockroom+ (the "Editing" toggle
                above is itself gated), and Location delete is Stockroom+
                same as Add/Edit, so there's nothing stricter to layer on
                top for just this one button. */}
            <Button
              size="small"
              color="error"
              onClick={() => onRequestDelete({ id: String(location.id), name: location.name })}
            >
              <Delete />
            </Button>
          </ButtonGroup>
        </Stack>
      </Stack>
      <Collapse in={expanded}>
        {location.children.map((l) => (
          <Location
            key={l.id}
            location={l}
            parent={location}
            setSelectedLocation={setSelectedLocation}
            editing={editing}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </Collapse>
    </Container>
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
  const [editing, setEditing] = useState(false);
  const {
    data: locations,
    isPending: isLocationsPending,
    isError: isLocationsError,
    error: locationsError,
  } = useQuery({
    queryKey: locationKeys.list(),
    queryFn: getLocations,
  });

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

  const qc = useQueryClient();

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
              <>
                <FormControlLabel
                  control={
                    <Switch checked={editing} onChange={() => setEditing((prev) => !prev)} />
                  }
                  label="Editing"
                />
                {editing && (
                  <Tooltip title="Add root location">
                    <IconButton onClick={() => setOpen(true)}>
                      <AddBox />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Browse locations and the containers stored in them.
          </Typography>
        </Box>
      </Stack>
      <Stack direction={'row'} spacing={2}>
        <Box sx={{ flexShrink: 0, maxWidth: 500 }}>
          {isLocationsPending ? (
            <CircularProgress size={24} />
          ) : (
            locations &&
            locations.map((l) => (
              <Location
                location={l}
                key={l.id}
                setSelectedLocation={setSelectedLocation}
                editing={editing}
                onRequestDelete={deleteConfirm.request}
              />
            ))
          )}
        </Box>
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

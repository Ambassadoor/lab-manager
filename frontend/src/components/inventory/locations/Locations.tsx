import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
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
import { useNavigate } from 'react-router-dom';
import { printLabel } from '../../../api/bridge';

type LocationProps = {
  location: Location;
  parent?: Location;
  setSelectedLocation: React.Dispatch<React.SetStateAction<string>>;
  editing?: boolean;
  onDelete: UseMutationResult<unknown, Error, string, unknown>;
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
const Location = ({ location, parent, setSelectedLocation, editing, onDelete }: LocationProps) => {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const { user } = useAuth();

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
            {(user?.role === 'lab_manager' || user?.role === 'coordinator') && (
              <Button
                size="small"
                color="error"
                onClick={() => onDelete.mutate(String(location.id))}
              >
                <Delete />
              </Button>
            )}
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
            onDelete={onDelete}
          />
        ))}
      </Collapse>
    </Container>
  );
};

//TODO: Add selected location id to url query for navigation
// Component for viewing/editing locations and their assigned containers
export const Locations = () => {
  const [open, setOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
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

  //Invalidates location data after successful deletion
  //TODO: Need to add confirmation message to prevent accidental deletions
  const mutation = useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: (_data, deletedId) => {
      // Clear the selection first so the invalidation below refetches
      // containers for '' (getContainers) instead of re-requesting the
      // now-deleted location's containers endpoint (404).
      setSelectedLocation((prev) => (prev === deletedId ? '' : prev));
      // .all — a deleted location can also affect the menu dropdown and any open containers view
      qc.invalidateQueries({
        queryKey: locationKeys.all,
      });
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
      {mutation.isError && (
        <Alert
          severity="error"
          onClose={() => {
            mutation.reset();
          }}
          sx={{ mb: 2 }}
        >
          {mutation.error.message}
        </Alert>
      )}
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
            <FormControlLabel
              control={<Switch checked={editing} onChange={() => setEditing((prev) => !prev)} />}
              label="Editing"
            />
            {editing && (
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
                onDelete={mutation}
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

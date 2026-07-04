import { useQuery } from '@tanstack/react-query';
import { getContainers, getLocationContainers, getLocations } from '../../../api/inventory';
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
} from '@mui/icons-material';
import {
  Box,
  Button,
  ButtonGroup,
  Collapse,
  Container,
  FormControlLabel,
  Icon,
  IconButton,
  Paper,
  Stack,
  Switch,
  Typography,
  useTheme,
} from '@mui/material';
import type { Location } from '../../../types';
import { useState } from 'react';
import { AddLocation } from './AddLocation';
import { AgGridReact } from 'ag-grid-react';
import { type ColDef, themeMaterial } from 'ag-grid-community';
import { EditLocation } from './EditLocation';

type LocationProps = {
  location: Location;
  parent?: Location;
  setSelectedLocation: React.Dispatch<React.SetStateAction<string>>;
  editing?: boolean;
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

const Location = ({ location, parent, setSelectedLocation, editing }: LocationProps) => {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

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
          {editing && (
            <ButtonGroup variant="contained">
              <Button onClick={() => setOpen(true)} size="small">
                <AddBox />
              </Button>
              <Button size="small" onClick={() => setOpenEdit(true)}>
                <Edit />
              </Button>
            </ButtonGroup>
          )}
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
          />
        ))}
      </Collapse>
    </Container>
  );
};

//TODO: Add selected location id to url query for navigation
export const Locations = () => {
  const [open, setOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [editing, setEditing] = useState(false);
  const { data: locations } = useQuery({
    queryKey: ['locationData'],
    queryFn: getLocations,
  });

  const { isPending, data: locationContainers } = useQuery({
    queryKey: ['locationContainers', selectedLocation],
    queryFn: async () => {
      if (selectedLocation.length > 0) {
        const location = await getLocationContainers(selectedLocation);
        return location.containers;
      } else {
        return await getContainers();
      }
    },
  });

  const [colDefs] = useState<ColDef[]>([
    { field: 'label', headerName: 'ID' },
    { field: 'name' },
    { field: 'manufacturer' },
    { field: 'quantity' },
    { field: 'product_num', headerName: 'Product #' },
  ]);

  const pagination = true;
  const paginationPageSize = 50;
  const paginationPageSizeSelector = [10, 25, 50];

  const theme = useTheme();
  const myTheme = themeMaterial.withParams({
    accentColor: theme.palette.info.main,
    backgroundColor: 'transparent',
    foregroundColor: theme.palette.text.primary,
    headerTextColor: theme.palette.text.primary,
    browserColorScheme: theme.palette.mode,
    wrapperBorderRadius: theme.shape.borderRadius,
    textColor: theme.palette.text.primary,
    borderColor: theme.palette.divider,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.body2.fontSize,
  });

  return (
    <Container>
      <Box sx={{ display: 'flex' }}>
        <Typography variant="h3">Locations</Typography>
        <AddLocation id={''} open={open} setOpen={setOpen} />
        {editing && (
          <IconButton sx={{ my: 'auto' }} size="large" onClick={() => setOpen(true)}>
            <AddBox />
          </IconButton>
        )}
        <FormControlLabel
          control={<Switch checked={editing} onChange={() => setEditing((prev) => !prev)} />}
          label="Editing"
          sx={{ ml: 'auto' }}
        />
      </Box>
      <Stack direction={'row'} spacing={2}>
        <Box>
          {locations &&
            locations.map((l) => (
              <Location
                location={l}
                key={l.id}
                setSelectedLocation={setSelectedLocation}
                editing={editing}
              />
            ))}
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Paper elevation={4} sx={{ height: '75dvh' }}>
            <AgGridReact
              loading={isPending}
              theme={myTheme}
              rowData={locationContainers}
              columnDefs={colDefs}
              pagination={pagination}
              paginationPageSize={paginationPageSize}
              paginationPageSizeSelector={paginationPageSizeSelector}
              autoSizeStrategy={{ type: 'fitCellContents' }}
            />
          </Paper>
        </Box>
      </Stack>
    </Container>
  );
};

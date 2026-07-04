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
} from '@mui/icons-material';
import {
  Box,
  Button,
  Collapse,
  Container,
  Icon,
  IconButton,
  Paper,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import type { Location } from '../../../types';
import { useState } from 'react';
import { AddLocation } from './AddLocation';
import { AgGridReact } from 'ag-grid-react';
import { type ColDef, themeMaterial } from 'ag-grid-community';

type LocationProps = {
  location: Location;
  setSelectedLocation: React.Dispatch<React.SetStateAction<string>>;
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

const Location = ({ location, setSelectedLocation }: LocationProps) => {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <Container>
      <AddLocation id={String(location.id)} open={open} setOpen={setOpen} />
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
          <IconButton onClick={() => setOpen(true)}>
            <AddBox />
          </IconButton>
        </Stack>
      </Stack>
      <Collapse in={expanded}>
        {location.children.map((l) => (
          <Location key={l.id} location={l} setSelectedLocation={setSelectedLocation} />
        ))}
      </Collapse>
    </Container>
  );
};

//TODO: Add selected location id to url query for navigation
export const Locations = () => {
  const [open, setOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
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
        <IconButton sx={{ my: 'auto' }} size="large" onClick={() => setOpen(true)}>
          <AddBox />
        </IconButton>
      </Box>
      <Stack direction={'row'} spacing={2}>
        <Box>
          {locations &&
            locations.map((l) => (
              <Location location={l} key={l.id} setSelectedLocation={setSelectedLocation} />
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

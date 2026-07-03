import { useQuery } from '@tanstack/react-query';
import { getLocations } from '../../../api/inventory';
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
import { Box, Collapse, Container, Icon, IconButton, Stack, Typography } from '@mui/material';
import type { Location } from '../../../types';
import { useState } from 'react';
import { AddLocation } from './AddLocation';

type LocationProps = {
  location: Location;
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

const Location = ({ location }: LocationProps) => {
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
          <Typography>{location.name}</Typography>
          {location.type.icon && iconMap.get(location.type.icon)}
          {location.children.length > 0 && <Typography>({location.children.length})</Typography>}
          <IconButton onClick={() => setOpen(true)}>
            <AddBox />
          </IconButton>
        </Stack>
      </Stack>
      <Collapse in={expanded}>
        {location.children.map((l) => (
          <Location key={l.id} location={l} />
        ))}
      </Collapse>
    </Container>
  );
};

export const Locations = () => {
  const [open, setOpen] = useState(false);
  const { data: locations } = useQuery({
    queryKey: ['locationData'],
    queryFn: getLocations,
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
      {locations && locations.map((l) => <Location location={l} key={l.id} />)}
    </Container>
  );
};

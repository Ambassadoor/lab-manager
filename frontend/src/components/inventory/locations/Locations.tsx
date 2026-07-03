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
} from '@mui/icons-material';
import { Collapse, Container, Icon, IconButton, Stack, Typography } from '@mui/material';
import type { Location } from '../../../types';
import { useState } from 'react';

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

  return (
    <Container>
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
  const { data: locations } = useQuery({
    queryKey: ['locationData'],
    queryFn: getLocations,
  });

  return (
    <Container>{locations && locations.map((l) => <Location location={l} key={l.id} />)}</Container>
  );
};

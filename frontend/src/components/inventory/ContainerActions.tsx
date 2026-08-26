import { TabContext, TabList, TabPanel } from '@mui/lab';
import { Box, Container, Paper, Tab, Typography } from '@mui/material';
import { Checkout } from './Checkout';
import { WeighIn } from './WeighIn';
import { useSearchParams } from 'react-router-dom';
import { Transfer } from './locations/Transfer';
import { Move } from './locations/Move';

// A quick access component for various container actions
export const ContainerActions = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = Number(searchParams.get('tab')) || 0;

  //Adds the tab index to the url for better user navigation
  const handleChange = (_: React.SyntheticEvent, newValue: string) => {
    setSearchParams({ tab: newValue });
  };
  return (
    <Container>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">Quick Actions</Typography>
        <Typography variant="body2" color="text.secondary">
          Check containers out, check them back in with a weigh-in, transfer their location, or move
          locations to a new parent location.
        </Typography>
      </Box>
      <Paper elevation={4} sx={{ height: '80dvh', overflow: 'auto' }}>
        <TabContext value={value}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <TabList onChange={handleChange}>
              <Tab label="Check Out" value={0} />
              <Tab label="Check In" value={1} />
              <Tab label="Move Containers" value={2} />
              <Tab label="Move Locations" value={3} />
            </TabList>
          </Box>
          <Box>
            <TabPanel value={0}>
              <Checkout />
            </TabPanel>
            <TabPanel value={1}>
              <WeighIn />
            </TabPanel>
            <TabPanel value={2}>
              <Transfer />
            </TabPanel>
            <TabPanel value={3}>
              <Move />
            </TabPanel>
          </Box>
        </TabContext>
      </Paper>
    </Container>
  );
};

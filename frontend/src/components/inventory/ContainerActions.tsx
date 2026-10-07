import { TabContext, TabList, TabPanel } from '@mui/lab';
import { Box, Container, Paper, Tab, Typography } from '@mui/material';
import { Checkout } from './Checkout';
import { WeighIn } from './WeighIn';
import { useSearchParams } from 'react-router-dom';
import { Transfer } from './locations/Transfer';
import { Move } from './locations/Move';

// Each tab's card has its own padding, so the panel's is trimmed on a phone.
const panelSx = { p: { xs: 1, sm: 3 } };

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
        <Typography variant="h4" sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>
          Quick Actions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Scan items into a list, or add them by ID, then confirm: check containers out, check them
          back in with a weigh-in, move containers to a new location, or move locations to a new
          parent.
        </Typography>
      </Box>
      <Paper elevation={4} sx={{ minHeight: '80dvh' }}>
        <TabContext value={value}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            {/* Scrolls sideways on a phone, where the four labels don't fit */}
            <TabList onChange={handleChange} variant="scrollable" allowScrollButtonsMobile>
              <Tab label="Check Out" value={0} />
              <Tab label="Check In" value={1} />
              <Tab label="Move Containers" value={2} />
              <Tab label="Move Locations" value={3} />
            </TabList>
          </Box>
          <Box>
            <TabPanel value={0} sx={panelSx}>
              <Checkout />
            </TabPanel>
            <TabPanel value={1} sx={panelSx}>
              <WeighIn />
            </TabPanel>
            <TabPanel value={2} sx={panelSx}>
              <Transfer />
            </TabPanel>
            <TabPanel value={3} sx={panelSx}>
              <Move />
            </TabPanel>
          </Box>
        </TabContext>
      </Paper>
    </Container>
  );
};

import { TabContext, TabList, TabPanel } from '@mui/lab';
import { Box, Container, Paper, Tab, Typography } from '@mui/material';
import { useState } from 'react';
import { Checkout } from './Checkout';
import { WeighIn } from './WeighIn';
import { useSearchParams } from 'react-router-dom';
import { Transfer } from './locations/Transfer';

// A quick access component for various container actions
export const ContainerActions = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [value, setValue] = useState(Number(searchParams.get('tab')) || 0);

  //Adds the tab index to the url for better user navigation
  const handleChange = (_: React.SyntheticEvent, value: string) => {
    setValue(Number(value));
    setSearchParams({ tab: value });
  };
  return (
    <Container>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">Container Actions</Typography>
        <Typography variant="body2" color="text.secondary">
          Check containers out, check them back in with a weigh-in, or transfer their location.
        </Typography>
      </Box>
      <Paper elevation={4} sx={{ height: '80dvh', overflow: 'auto' }}>
        <TabContext value={value}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <TabList onChange={handleChange}>
              <Tab label="Check Out" value={0} />
              <Tab label="Check In" value={1} />
              <Tab label="Transfer Location" value={2} />
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
          </Box>
        </TabContext>
      </Paper>
    </Container>
  );
};

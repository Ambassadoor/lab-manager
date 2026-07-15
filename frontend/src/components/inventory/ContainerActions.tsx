import { TabContext, TabList, TabPanel } from '@mui/lab';
import { Box, Container, Paper, Tab } from '@mui/material';
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
      <Paper elevation={4} sx={{ height: '80dvh', overflow: 'auto' }}>
        <TabContext value={value}>
          <Paper elevation={6} variant="outlined">
            <TabList onChange={handleChange}>
              <Tab label="Check Out" value={0} />
              <Tab label="Check In" value={1} />
              <Tab label="Transfer Location" value={2} />
            </TabList>
          </Paper>
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

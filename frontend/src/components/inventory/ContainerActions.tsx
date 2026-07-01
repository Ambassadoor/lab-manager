import { TabContext, TabList, TabPanel } from '@mui/lab';
import { Box, Container, Paper, Tab } from '@mui/material';
import { useState } from 'react';
import { Checkout } from './Checkout';

export const ContainerActions = () => {
  const [value, setValue] = useState(0);

  const handleChange = (_: React.SyntheticEvent, value: string) => {
    setValue(Number(value));
  };
  return (
    <Container>
      <Paper elevation={4} sx={{ height: '80dvh', overflow: 'auto' }}>
        <TabContext value={value}>
          <Paper elevation={6} variant="outlined">
            <TabList onChange={handleChange}>
              <Tab label="Check Out" value={0} />
              <Tab label="Check In" value={1} />
              <Tab label="Update Weight" value={2} />
            </TabList>
          </Paper>
          <Box>
            <TabPanel value={0}>
              <Checkout event={'out'} />
            </TabPanel>
            <TabPanel value={1}>
              <Checkout event={'in'} />
            </TabPanel>

            <TabPanel value={2}></TabPanel>
          </Box>
        </TabContext>
      </Paper>
    </Container>
  );
};

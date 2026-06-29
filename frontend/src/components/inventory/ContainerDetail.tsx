import { Box, Card, CardContent, CardHeader, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getContainerDetails } from '../../api/inventory';

import type { Container } from '../../types';

export const ContainerDetail = () => {
  const [details, setDetails] = useState<Container>();
  const params = useParams();

  useEffect(() => {
    if (!params.id) return;
    getContainerDetails(params.id).then(setDetails);
  }, [params.id]);

  return (
    details && (
      <Box>
        <Card>
          <CardHeader title={details.name} subheader={details.label} />
          <CardContent>
            <Stack spacing={2}>
              <Typography>Location: {details.location}</Typography>
              <Typography>Manufacturer: {details.manufacturer}</Typography>
              <Typography>Product #: ${details.product_num}</Typography>
              <Typography>Quantity: {details.quantity}</Typography>
              <Typography>Stats: {details.is_opened ? 'Opened' : 'Unopened'}</Typography>
              <Typography>Current Weight: {parseFloat(details.latest_reading.weight)} g</Typography>
              <Typography>Percent Remaining: {details.percent_remaining}%</Typography>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    )
  );
};

import { Box, Card, CardContent, CardHeader, Stack, Typography } from '@mui/material';
import { useEffect, useState} from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getContainerDetails } from '../../api/inventory';
import type { Container } from '../../types';

type ContainerDetailProps = {
    data?: Container
}

export const ContainerDetail = ({data}: ContainerDetailProps) => {
  const location = useLocation()
  const [container, setContainer] = useState<Container>(data || location.state || {})
  const params = useParams()

  useEffect(() => {
    const locationData = location.state || {}
    if (!locationData && !data) {
        if (!params.id) {
            return
        }
        getContainerDetails(params.id).then(setContainer)
    }
  },[params.id, location, data])

  return (
    container && (
      <Box sx={{display: "flex", justifyContent: "center"}}>
        <Card sx={{width: `${data ? '25dvw' : '50dvw'}`, alignSelf: "center"}} elevation={6}>
          <CardHeader title={container.name} subheader={container.label} />
          <CardContent>
            <Stack spacing={2}>
              <Typography><strong>Location:</strong> {container.location}</Typography>
              <Typography><strong>Manufacturer:</strong> {container.manufacturer}</Typography>
              <Typography><strong>Product #:</strong> {container.product_num}</Typography>
              <Typography><strong>Quantity:</strong> {container.quantity}</Typography>
              <Typography><strong>Status:</strong> {container.is_opened ? 'Opened' : 'Unopened'}</Typography>
              {container.latest_reading && <Typography><strong>Current Weight:</strong> {parseFloat(container.latest_reading.weight)} g</Typography>}
              {container.percent_remaining && <Typography><strong>Percent Remaining:</strong> {container.percent_remaining}%</Typography>}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    )
  );
};

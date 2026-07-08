import { Card, CardContent, CardHeader, Container, List, ListItem, Stack } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '../../api/inventory';

export const Dashboard = () => {
  const { data: { recently_added = [], restock_soon = [], checked_out = [] } = {} } = useQuery({
    queryKey: ['dashboardData'],
    queryFn: getDashboard,
  });

  return (
    <Container>
      <Stack
        direction={'row'}
        useFlexGap
        sx={{ flexWrap: 'wrap', justifyContent: 'space-between' }}
      >
        <Card elevation={2}>
          <CardHeader title="Recently Added" />
          <CardContent>
            <List>
              {recently_added?.length > 0 ? (
                recently_added.map((c) => <ListItem key={c.id}>{c.name}</ListItem>)
              ) : (
                <ListItem>No items</ListItem>
              )}
            </List>
          </CardContent>
        </Card>
        <Card elevation={2}>
          <CardHeader title="Restock Soon" />
          <CardContent>
            <List>
              {restock_soon.length > 0 ? (
                restock_soon.map((c) => <ListItem key={c.id}>{c.name}</ListItem>)
              ) : (
                <ListItem>No items</ListItem>
              )}
            </List>
          </CardContent>
        </Card>
        <Card elevation={2}>
          <CardHeader title="Checked Out" />
          <CardContent>
            <List>
              {checked_out.length > 0 ? (
                checked_out.map((c) => <ListItem key={c.id}>{c.name}</ListItem>)
              ) : (
                <ListItem>No items</ListItem>
              )}
            </List>
          </CardContent>
        </Card>
        <Card elevation={2}>
          <CardHeader title="Expired" />
          <CardContent>
            <List>
              <ListItem>Coming Soon</ListItem>
            </List>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
};

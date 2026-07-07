import { Card, CardContent, CardHeader, Container, Stack } from '@mui/material';

export const Dashboard = () => {
  return (
    <Container>
      <Stack
        direction={'row'}
        spacing={24}
        useFlexGap
        sx={{ flexWrap: 'wrap', justifyContent: 'space-between' }}
      >
        <Card elevation={2}>
          <CardHeader title="Recently Added" />
          <CardContent>
            <>Coming Soon</>
          </CardContent>
        </Card>
        <Card elevation={2}>
          <CardHeader title="Restock Soon">
            <CardContent>
              <>Coming Soon</>
            </CardContent>
          </CardHeader>
        </Card>
        <Card elevation={2}>
          <CardHeader title="Checked Out" />
          <CardContent>
            <>Coming Soon</>
          </CardContent>
        </Card>
        <Card elevation={2}>
          <CardHeader title="Expired" />
          <CardContent>
            <>Coming Soon</>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
};

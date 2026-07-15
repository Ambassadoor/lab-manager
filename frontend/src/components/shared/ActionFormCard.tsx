import { Box, Card, CardActions, CardContent, CardHeader } from '@mui/material';
import type { ReactNode, SyntheticEvent } from 'react';

type ActionFormCardProps = {
  title: string;
  subheader?: string;
  onSubmit: (event: SyntheticEvent) => unknown;
  actions: ReactNode;
  children: ReactNode;
};

// Shared layout for the Container Actions tabs (Check Out, Check In, Transfer Location)
export const ActionFormCard = ({
  title,
  subheader,
  onSubmit,
  actions,
  children,
}: ActionFormCardProps) => (
  <Box component={'form'} sx={{ display: 'flex', justifyContent: 'center' }} onSubmit={onSubmit}>
    <Card sx={{ width: '100%', maxWidth: 600 }} elevation={6}>
      <CardHeader title={title} subheader={subheader} />
      <CardContent>{children}</CardContent>
      <CardActions>{actions}</CardActions>
    </Card>
  </Box>
);

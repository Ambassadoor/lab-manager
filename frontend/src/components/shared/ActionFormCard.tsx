import { Box, Card, CardActions, CardContent, CardHeader } from '@mui/material';
import type { ReactNode, SyntheticEvent } from 'react';

type ActionFormCardProps = {
  title: string;
  subheader?: string;
  onSubmit: (event: SyntheticEvent) => unknown;
  actions: ReactNode;
  children: ReactNode;
  // Check In's row can have a third field (tare weight) beside the usual
  // two — 600 was sized for two fields per row and visibly cramps a third,
  // so callers that need more room can widen it. Defaults to the original
  // 600 for every other consumer (Checkout, Transfer, Move).
  maxWidth?: number;
};

// Shared layout for the Container Actions tabs (Check Out, Check In, Transfer Location)
export const ActionFormCard = ({
  title,
  subheader,
  onSubmit,
  actions,
  children,
  maxWidth = 600,
}: ActionFormCardProps) => (
  <Box component={'form'} sx={{ display: 'flex', justifyContent: 'center' }} onSubmit={onSubmit}>
    <Card sx={{ width: '100%', maxWidth }} elevation={6}>
      <CardHeader title={title} subheader={subheader} />
      <CardContent>{children}</CardContent>
      <CardActions>{actions}</CardActions>
    </Card>
  </Box>
);

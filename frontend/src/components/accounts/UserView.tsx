import { CardContent, Stack } from '@mui/material';
import type { User } from '../../types';
import { DetailRow } from '../shared/DetailRow';

// Read-only body of UserDetail's card (role is in the card's subheader)
export const UserView = ({ user }: { user: User }) => (
  <CardContent>
    <Stack spacing={1.5}>
      <DetailRow label="Email">{user.email}</DetailRow>
      <DetailRow label="Username">{user.username}</DetailRow>
      <DetailRow label="Lipscomb ID">{user.lipscomb_id || 'Not set'}</DetailRow>
    </Stack>
  </CardContent>
);

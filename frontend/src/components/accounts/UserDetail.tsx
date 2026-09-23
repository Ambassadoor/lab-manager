import { Card, CardHeader, Container, Divider, IconButton, Tooltip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';
import { getUserById } from '../../api/users';
import { userKeys } from '../../api/queryKeys';
import { useState } from 'react';
import { Edit } from '@mui/icons-material';
import { NotFound } from '../shared/NotFound';
import { UserView } from './UserView';
import { UserEditForm } from './UserEditForm';

// Admin/Lab Manager-only (the route is role-gated in App.tsx). Owns the data
// and header; the body is UserView or, while editing, UserEditForm (see
// ContainerDetail, same pattern).
export const UserDetail = () => {
  const [editing, setEditing] = useState(false);
  const location = useLocation();
  const { id } = useParams();

  const seed = location.state ?? undefined;

  // Checked locally rather than via throwOnError — a missing user id is an
  // expected 404, not an unexpected crash (see ChemicalDetail.tsx, same
  // pattern).
  const {
    data: user,
    isPending,
    isError,
  } = useQuery({
    queryKey: userKeys.detail(id ?? ''),
    queryFn: () => getUserById(id!),
    enabled: !!id,
    initialData: seed,
  });

  if (isError) return <NotFound />;
  if (isPending || !user) return null;

  return (
    <Container>
      <Card>
        <CardHeader
          title={`${user.first_name} ${user.last_name}`}
          subheader={user.role_display}
          action={
            // Hidden while editing — the form's own Cancel covers leaving
            !editing && (
              <Tooltip title="Edit">
                <IconButton onClick={() => setEditing(true)}>
                  <Edit />
                </IconButton>
              </Tooltip>
            )
          }
        />
        <Divider />
        {editing ? (
          <UserEditForm user={user} onDone={() => setEditing(false)} />
        ) : (
          <UserView user={user} />
        )}
      </Card>
    </Container>
  );
};

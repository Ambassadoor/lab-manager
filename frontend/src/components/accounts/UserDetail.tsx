import {
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Container,
  IconButton,
  Stack,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';
import { getUserById, updateUser, type UserUpdate } from '../../api/users';
import { userKeys } from '../../api/queryKeys';
import { Controller, useForm } from 'react-hook-form';
import { ToggleField } from '../shared/ToggleField';
import { useState } from 'react';
import { Edit } from '@mui/icons-material';
import type { Role } from '../../types';
import { NotFound } from '../shared/NotFound';

// Six roles that change rarely — a static list here, rather than a round
// trip to fetch choices dynamically (see ContainerForm.tsx's OPTIONS-based
// quantity_unit picker for the alternative, used where the choices are
// actually admin-configurable data).
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'lab_manager', label: 'Lab Manager' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'stockroom', label: 'Stockroom Worker' },
  { value: 'lab_assistant', label: 'Lab Assistant' },
];

// Admin/Lab Manager-only, same shape as ChemicalDetail.tsx: a toggle
// between display and edit mode rather than a separate form page.
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

  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ data, userId }: { data: UserUpdate; userId: string }) =>
      updateUser(userId, data),
    onSuccess: () => {
      // .all — an edit here can also change what shows in the Users list
      qc.invalidateQueries({ queryKey: userKeys.all });
      setEditing(false);
    },
  });

  const {
    control,
    clearErrors,
    handleSubmit,
    formState: { isValidating },
  } = useForm({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    values: user,
    defaultValues: {
      username: user?.username,
      first_name: user?.first_name,
      last_name: user?.last_name,
      email: user?.email,
      lipscomb_id: user?.lipscomb_id ?? '',
      role: user?.role,
    },
  });

  const onSubmit = (data: UserUpdate) => {
    if (!user) return;
    mutation.mutate({ data, userId: String(user.id) });
  };

  if (isError) return <NotFound />;

  return (
    !isPending && (
      <Container>
        <Card component={'form'} onSubmit={handleSubmit(onSubmit)}>
          <CardHeader
            title={`${user?.first_name} ${user?.last_name}`}
            subheader={user?.role_display}
            action={
              <IconButton onClick={() => setEditing((prev) => !prev)}>
                <Edit />
              </IconButton>
            }
          />
          <CardContent>
            <Stack spacing={2}>
              <Controller
                control={control}
                name="first_name"
                rules={{ required: { value: true, message: 'Required' } }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: user?.first_name,
                      label: 'First Name',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                  >
                    {user?.first_name}
                  </ToggleField>
                )}
              />
              <Controller
                control={control}
                name="last_name"
                rules={{ required: { value: true, message: 'Required' } }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: user?.last_name,
                      label: 'Last Name',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                  >
                    {user?.last_name}
                  </ToggleField>
                )}
              />
              <Controller
                control={control}
                name="email"
                rules={{
                  required: { value: true, message: 'Required' },
                  pattern: {
                    value: /^[a-zA-Z0-9._%+-]+@(mail\.)?lipscomb\.edu$/,
                    message: 'Must be a Lipscomb email address',
                  },
                }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: user?.email,
                      label: 'Email',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                  >
                    {user?.email}
                  </ToggleField>
                )}
              />
              <Controller
                control={control}
                name="username"
                rules={{ required: { value: true, message: 'Required' } }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: user?.username,
                      label: 'Username',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                  >
                    {user?.username}
                  </ToggleField>
                )}
              />
              <Controller
                control={control}
                name="lipscomb_id"
                rules={{
                  validate: (value) =>
                    !value || /^L[0-9]{8}$/.test(value ?? '') || 'Must match L12345678 format',
                }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: user?.lipscomb_id ?? '',
                      label: 'Lipscomb ID',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                  >
                    {user?.lipscomb_id}
                  </ToggleField>
                )}
              />
              <Controller
                control={control}
                name="role"
                rules={{ required: { value: true, message: 'Required' } }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: user?.role,
                      label: 'Role',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                    options={ROLE_OPTIONS.map((r) => ({
                      key: r.value,
                      value: r.value,
                      text: r.label,
                    }))}
                  >
                    {user?.role_display}
                  </ToggleField>
                )}
              />
            </Stack>
          </CardContent>
          {editing && (
            <CardActions>
              <Button
                type="submit"
                variant="contained"
                loading={mutation.isPending || isValidating}
              >
                Submit
              </Button>
              <Button onClick={() => setEditing(false)}>Cancel</Button>
            </CardActions>
          )}
        </Card>
      </Container>
    )
  );
};

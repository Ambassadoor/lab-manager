import { Alert, Button, Container, IconButton, Snackbar, Stack, TextField } from '@mui/material';
import { Close } from '@mui/icons-material';
import { Controller, useForm, type SubmitHandler } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/client';
import type { ProfileUpdate } from '../../api/auth';
import { ActionFormCard } from '../shared/ActionFormCard';

type Inputs = {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  lipscomb_id: string;
};

type SnackbarState = { message: string; severity: 'success' | 'error' };

const defaultsFrom = (user: {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  lipscomb_id: string | null;
}): Inputs => ({
  first_name: user.first_name,
  last_name: user.last_name,
  email: user.email,
  username: user.username,
  lipscomb_id: user.lipscomb_id ?? '',
});

// Self-service view/edit of the current user's own account. `role` is
// shown but never editable here — UserSerializer keeps it read_only
// regardless of what's posted, so this mirrors the backend rather than
// just hiding a field the API would silently ignore anyway.
export const Profile = () => {
  const { user, updateProfile } = useAuth();
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    clearErrors,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Inputs>({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: user
      ? defaultsFrom(user)
      : { first_name: '', last_name: '', email: '', username: '', lipscomb_id: '' },
  });

  // RequireAuth guarantees `user` is set before this page can render, but
  // AuthProvider resolves it asynchronously on mount — this keeps the form
  // in sync if that resolution lands after the form's own initial render.
  useEffect(() => {
    if (user) reset(defaultsFrom(user));
  }, [user, reset]);

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const payload: ProfileUpdate = { ...data, lipscomb_id: data.lipscomb_id || null };
    try {
      await updateProfile(payload);
      reset(data);
      setSnackbar({ message: 'Profile updated.', severity: 'success' });
    } catch (err) {
      // Field-shaped errors (e.g. "username already taken") land on the
      // matching input; anything else falls back to the snackbar.
      let matchedField = false;
      if (err instanceof ApiError && err.fieldErrors) {
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if (field in data) {
            setError(field as keyof Inputs, { message });
            matchedField = true;
          }
        }
      }
      if (!matchedField) {
        setSnackbar({
          message: err instanceof Error ? err.message : 'Failed to update profile.',
          severity: 'error',
        });
      }
    }
  };

  if (!user) return null;

  return (
    <Container maxWidth={false} sx={{ py: 4 }}>
      <Snackbar
        open={!!snackbar}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={6000}
        action={
          <IconButton onClick={() => setSnackbar(null)} color="inherit">
            <Close />
          </IconButton>
        }
      >
        <Alert
          onClose={() => setSnackbar(null)}
          severity={snackbar?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
      <ActionFormCard
        title="Profile"
        subheader="View and edit your account information."
        onSubmit={handleSubmit(onSubmit)}
        actions={
          <Button type="submit" variant="contained" loading={isSubmitting} disabled={!isDirty}>
            Save
          </Button>
        }
      >
        <Stack spacing={2}>
          <TextField label="Role" value={user.role_display} disabled fullWidth />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Controller
              name="first_name"
              control={control}
              rules={{ required: 'First name is required' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  autoComplete="given-name"
                  label="First Name"
                  fullWidth
                  error={!!errors.first_name}
                  helperText={errors.first_name?.message}
                  onChange={(e) => {
                    field.onChange(e);
                    clearErrors('first_name');
                  }}
                />
              )}
            />
            <Controller
              name="last_name"
              control={control}
              rules={{ required: 'Last name is required' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  autoComplete="family-name"
                  label="Last Name"
                  fullWidth
                  error={!!errors.last_name}
                  helperText={errors.last_name?.message}
                  onChange={(e) => {
                    field.onChange(e);
                    clearErrors('last_name');
                  }}
                />
              )}
            />
          </Stack>
          <Controller
            name="email"
            control={control}
            rules={{
              required: 'Email is required',
              pattern: {
                value: /^[a-zA-Z0-9._%+-]+@(mail\.)?lipscomb\.edu$/,
                message: 'Please use your Lipscomb email address',
              },
            }}
            render={({ field }) => (
              <TextField
                {...field}
                autoComplete="email"
                label="Email"
                fullWidth
                error={!!errors.email}
                helperText={errors.email?.message}
                onChange={(e) => {
                  field.onChange(e);
                  clearErrors('email');
                }}
              />
            )}
          />
          <Controller
            name="username"
            control={control}
            rules={{ required: 'Username is required' }}
            render={({ field }) => (
              <TextField
                {...field}
                autoComplete="username"
                label="Username"
                fullWidth
                error={!!errors.username}
                helperText={errors.username?.message}
                onChange={(e) => {
                  field.onChange(e);
                  clearErrors('username');
                }}
              />
            )}
          />
          <Controller
            name="lipscomb_id"
            control={control}
            rules={{
              validate: (value) =>
                !value || /^L[0-9]{8}$/.test(value) || 'Please match L12345678 format',
            }}
            render={({ field }) => (
              <TextField
                {...field}
                label="Lipscomb ID"
                fullWidth
                error={!!errors.lipscomb_id}
                helperText={errors.lipscomb_id?.message}
                onChange={(e) => {
                  field.onChange(e);
                  clearErrors('lipscomb_id');
                }}
              />
            )}
          />
        </Stack>
      </ActionFormCard>
    </Container>
  );
};

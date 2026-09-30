import { Alert, Button, Container, IconButton, Snackbar, Stack, TextField } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ProfileUpdate } from '../../api/auth';
import { ActionFormCard } from '../shared/ActionFormCard';
import { applyApiErrors } from '../shared/applyApiErrors';
import { UserFields } from './UserFields';
import { userFormDefaults, type UserFormValues } from './userForm';

type SnackbarState = { message: string; severity: 'success' | 'error' };

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
    formState: { isSubmitting, isDirty },
  } = useForm<UserFormValues>({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: user
      ? userFormDefaults(user)
      : { first_name: '', last_name: '', email: '', username: '', lipscomb_id: '' },
  });

  // RequireAuth guarantees `user` is set before this page can render, but
  // AuthProvider resolves it asynchronously on mount — this keeps the form
  // in sync if that resolution lands after the form's own initial render.
  useEffect(() => {
    if (user) reset(userFormDefaults(user));
  }, [user, reset]);

  const onSubmit: SubmitHandler<UserFormValues> = async (data) => {
    const payload: ProfileUpdate = { ...data, lipscomb_id: data.lipscomb_id || null };
    try {
      await updateProfile(payload);
      reset(data);
      setSnackbar({ message: 'Profile updated.', severity: 'success' });
    } catch (err) {
      // Field-shaped errors (e.g. "username already taken") land on the
      // matching input; anything else falls back to the snackbar.
      const message = applyApiErrors(err, data, setError);
      if (message) setSnackbar({ message, severity: 'error' });
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
          <UserFields control={control} clearErrors={clearErrors} />
        </Stack>
      </ActionFormCard>
    </Container>
  );
};

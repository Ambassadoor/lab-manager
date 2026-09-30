import {
  Alert,
  Box,
  Button,
  Card,
  Container,
  IconButton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { Controller, useForm, type SubmitHandler } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useState } from 'react';

type Inputs = {
  username: string;
  password: string;
};

type SnackbarState = { message: string; severity: 'error' };

export const Login = () => {
  const { loading, login, user } = useAuth();
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data): Promise<void> => {
    try {
      await login(data.username, data.password);
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : 'Login failed.',
        severity: 'error',
      });
    }
  };
  if (loading) return null;

  if (user)
    return (
      <Container>
        <Typography>User already logged in</Typography>
      </Container>
    );

  return (
    <>
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
          severity={snackbar?.severity ?? 'error'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
      <Container
        sx={{
          padding: { sm: 4, md: 2 },
        }}
      >
        <Card
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignSelf: 'center',
            width: '100%',
            padding: 4,
            gap: 2,
            margin: 'auto',
            maxWidth: { sm: '450px' },
          }}
        >
          <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Stack spacing={2}>
              <Typography component={'h1'} variant="h4">
                Sign In
              </Typography>
              <Controller
                name="username"
                control={control}
                defaultValue={''}
                rules={{
                  required: 'Username is required',
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Username"
                    error={!!errors.username}
                    helperText={errors.username ? errors.username.message : ''}
                    fullWidth
                  />
                )}
              />
              <Controller
                name="password"
                control={control}
                defaultValue={''}
                rules={{
                  required: 'Password is required',
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Password"
                    type="password"
                    error={!!errors.password}
                    helperText={errors.password ? errors.password.message : ''}
                    fullWidth
                  />
                )}
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                disabled={isSubmitting}
              >
                Sign In
              </Button>
              <Typography>
                Don't have an account? <Link to="/register">Sign Up</Link>
              </Typography>
            </Stack>
          </Box>
        </Card>
      </Container>
    </>
  );
};

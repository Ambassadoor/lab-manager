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
import { Controller, useForm, useWatch, type SubmitHandler } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';

type Inputs = {
  username: string;
  password: string;
  confirm_password: string;
  email: string;
  first_name: string;
  last_name: string;
  lipscomb_id: string;
};

type CachedValues = {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
};

type SnackbarState = { message: string; severity: 'error' };

export const Register = () => {
  const { preValidate, register, user } = useAuth();
  const navigate = useNavigate();
  const submittedRef = useRef(false);
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);

  //Return cached form values
  const getCachedValues = (): CachedValues => {
    const cached = sessionStorage.getItem('register_form_cache');
    return cached
      ? JSON.parse(cached)
      : {
          username: '',
          email: '',
          first_name: '',
          last_name: '',
        };
  };

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields, isDirty },
    clearErrors,
    getValues,
    setError,
  } = useForm<Inputs>({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: getCachedValues(),
  });

  const formValues = useWatch({ control });

  //Cache user inputs
  useEffect(() => {
    //eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, confirm_password, lipscomb_id, ...valuesToCache } = formValues;
    sessionStorage.setItem('register_form_cache', JSON.stringify(valuesToCache));
  }, [formValues]);

  const onSubmit: SubmitHandler<Inputs> = async (data: Inputs): Promise<void> => {
    //eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirm_password, ...user } = data;
    try {
      await register(user);
      sessionStorage.removeItem('register_form_cache');
      navigate('/');
    } catch (err) {
      // Field-shaped errors (e.g. "username already taken") land on the
      // matching input; anything that doesn't map to a known field (a
      // non-field error, or a network/server failure) falls back to the
      // snackbar.
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
          message: err instanceof Error ? err.message : 'Registration failed.',
          severity: 'error',
        });
      }
    }
  };

  if (user)
    return (
      <Container>
        <Typography>
          User already logged in. Please logout before creating a new account.
        </Typography>
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
                Create Account
              </Typography>
              <Stack direction={'row'} spacing={2}>
                <Controller
                  name="first_name"
                  control={control}
                  rules={{
                    validate: {
                      required: async (value) => {
                        if (!dirtyFields.first_name && !submittedRef.current) return true;
                        if (!value) return 'First name is required';
                      },
                    },
                  }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      autoComplete="given-name"
                      label="First Name"
                      error={!!errors.first_name}
                      helperText={errors.first_name ? errors.first_name.message : ''}
                      fullWidth
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
                  rules={{
                    validate: (value) => {
                      if (!dirtyFields.last_name && !submittedRef.current) return true;
                      if (!value) return 'Last name is required';
                    },
                  }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      autoComplete="family-name"
                      label="Last Name"
                      error={!!errors.last_name}
                      helperText={errors.last_name ? errors.last_name.message : ''}
                      fullWidth
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
                  validate: async (value) => {
                    if (!dirtyFields.email && !submittedRef.current) return true;
                    if (!value) return 'Email is required';
                    const pattern = /^[a-zA-Z0-9._%+-]+@(mail\.)?lipscomb\.edu$/;
                    if (!pattern.test(value)) return 'Please use your Lipscomb email address';
                    const taken = await preValidate('email', value);
                    return taken?.errors.email ? taken.errors.email : true;
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    autoComplete="email"
                    label="Email"
                    error={!!errors.email}
                    helperText={errors.email ? errors.email.message : ''}
                    fullWidth
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
                rules={{
                  validate: async (value) => {
                    if (!dirtyFields.username && !submittedRef.current) return true;
                    if (!value) return 'Username is required';
                    const taken = await preValidate('username', value);
                    return taken?.errors.username ? taken?.errors.username : true;
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    autoComplete="username"
                    label="Username"
                    error={!!errors.username}
                    helperText={errors.username ? errors.username.message : ''}
                    fullWidth
                    onChange={(e) => {
                      field.onChange(e);
                      clearErrors('username');
                    }}
                  />
                )}
              />
              <Controller
                defaultValue=""
                name="password"
                control={control}
                rules={{
                  validate: (value) => {
                    if (!dirtyFields.password && !submittedRef.current) return true;
                    if (!value) return 'Password is required';
                    if (value.length < 8) return 'Minimum 8 characters';
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    autoComplete="new-password"
                    label="Password"
                    type="password"
                    error={!!errors.password}
                    helperText={errors.password ? errors.password.message : ''}
                    fullWidth
                    onChange={(e) => {
                      field.onChange(e);
                      clearErrors('password');
                    }}
                  />
                )}
              />
              <Controller
                defaultValue=""
                name="confirm_password"
                control={control}
                rules={{
                  validate: (value) => {
                    if (!dirtyFields.confirm_password && !submittedRef.current) return true;
                    if (!value) return 'Please confirm password';
                    return value === getValues('password') || 'Passwords do not match';
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    autoComplete="new-password"
                    label="Confirm Password"
                    type="password"
                    error={!!errors.confirm_password}
                    helperText={errors.confirm_password ? errors.confirm_password.message : ''}
                    fullWidth
                    onChange={(e) => {
                      field.onChange(e);
                      clearErrors('confirm_password');
                    }}
                  />
                )}
              />
              <Controller
                defaultValue=""
                name="lipscomb_id"
                control={control}
                rules={{
                  validate: (value) => {
                    if (!dirtyFields.lipscomb_id && !submittedRef.current) return true;
                    if (!value) return 'Please provide your Lipscomb ID';
                    const pattern = /^L[0-9]{8}$/;
                    if (!pattern.test(value)) return 'Please match L12345678 format';
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Lipscomb ID"
                    error={!!errors.lipscomb_id}
                    helperText={errors.lipscomb_id ? errors.lipscomb_id.message : ''}
                    onChange={(e) => {
                      field.onChange(e);
                      clearErrors('lipscomb_id');
                    }}
                  />
                )}
              />
              <Stack direction={'row'} spacing={2}>
                <Button
                  onClick={() => (submittedRef.current = true)}
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="large"
                  disabled={isSubmitting || Object.keys(errors).length > 0 || !isDirty}
                  fullWidth
                >
                  Submit
                </Button>
                <Button variant="outlined" size="large" fullWidth onClick={() => navigate('/')}>
                  Cancel
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Card>
      </Container>
    </>
  );
};

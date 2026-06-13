import { Box, Button, Card, Container, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import { Controller, useForm, type SubmitHandler } from 'react-hook-form';
import { Link } from 'react-router-dom';

type Inputs = {
  username: string;
  password: string;
};

export const Login = () => {
  const { loading, login } = useAuth();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = (data): Promise<void> =>
    login(data.username, data.password);
  if (loading) return null;

  return (
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
              Submit
            </Button>
            <Typography>
              Don't have an account? <Link to="/register">Sign Up</Link>
            </Typography>
          </Stack>
        </Box>
      </Card>
    </Container>
  );
};

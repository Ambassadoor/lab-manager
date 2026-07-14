import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  IconButton,
  InputAdornment,
  Snackbar,
  Stack,
  TextField,
} from '@mui/material';
import { Controller, useForm, type SubmitHandler } from 'react-hook-form';
import { checkValidId, createWeighIn } from '../../api/inventory';
import { getBalanceWeight } from '../../api/bridge';
import { containerKeys } from '../../api/queryKeys';
import type { WeighInDefaults } from '../../types';
import { useRef, useState } from 'react';
import { Close, MonitorWeight } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseBarcode } from '../shared/parseBarcode';

type SnackbarState = { message: string; severity: 'success' | 'error' };

export const WeighIn = () => {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const { control, handleSubmit, clearErrors, reset, setFocus, setValue } = useForm({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      slug: '',
      weight: '',
    },
  });

  const queryClient = useQueryClient();

  // Tracks whether the last onChange was a completed barcode scan, so we only
  // swallow the scanner's own trailing Enter keystroke, not a manual submit.
  const justScannedRef = useRef(false);

  const scaleMutation = useMutation({
    mutationFn: getBalanceWeight,
    onSuccess: (reading) => {
      setValue('weight', String(reading.weight));
      clearErrors('weight');
    },
    onError: (error: Error) => {
      setSnackbar({ message: error.message, severity: 'error' });
    },
  });

  const onSubmit: SubmitHandler<WeighInDefaults> = async (data) => {
    const response = await createWeighIn(data);
    if (response.id) {
      setSnackbar({ message: 'Weigh in recorded.', severity: 'success' });
      reset();
      // .all, not .list() — also refreshes this container's weigh-in history table
      queryClient.invalidateQueries({ queryKey: containerKeys.all });
    }
  };

  //TODO: Add a dynamic tare field for ids with no tare value
  return (
    <Box
      component={'form'}
      sx={{ display: 'flex', justifyContent: 'center' }}
      onSubmit={handleSubmit(onSubmit)}
    >
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
      <Card
        sx={{
          width: '50dvw',
          alignSelf: 'center',
        }}
        elevation={6}
      >
        <CardHeader
          title="Weigh In"
          subheader="Input your container ID (Chem-##) and weight in grams."
        />
        <CardContent>
          <Stack spacing={2}>
            <Controller
              name="slug"
              control={control}
              rules={{
                required: {
                  value: true,
                  message: 'Required',
                },
                pattern: {
                  value: /^chem-\d+$/i,
                  message: 'Must match format Chem-####',
                },
                validate: {
                  valid_id: async (value: string) => {
                    if (!!value || value === '') return;
                    const parts = value.toLocaleLowerCase().split('-');
                    const stripped = parseFloat(parts[1]);
                    const joined = parts[0] + '-' + String(stripped);
                    const response = await checkValidId(joined);
                    if (response.is_valid === false) return 'Invalid ID';
                  },
                },
              }}
              render={({ field: { name, onChange, ref, ...field }, fieldState: { error } }) => (
                <TextField
                  {...field}
                  inputRef={ref}
                  onChange={(e) => {
                    const scannedId = parseBarcode(e.target.value);
                    justScannedRef.current = !!scannedId;
                    if (scannedId) {
                      onChange(scannedId);
                      setFocus('weight');
                    } else {
                      onChange(e);
                    }
                    clearErrors(name);
                  }}
                  error={!!error}
                  helperText={error?.message}
                  label="ID"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && justScannedRef.current) {
                      e.preventDefault();
                      justScannedRef.current = false;
                    }
                  }}
                />
              )}
            />
            <Controller
              name="weight"
              control={control}
              rules={{
                required: {
                  value: true,
                  message: 'Required',
                },
                pattern: {
                  value: /^\d+(\.\d+)?$/,
                  message: 'Please input integer or decimal value.',
                },
              }}
              render={({ field: { name, onChange, ref, ...field }, fieldState: { error } }) => (
                <TextField
                  {...field}
                  inputRef={ref}
                  onChange={(e) => {
                    onChange(e);
                    clearErrors(name);
                  }}
                  error={!!error}
                  helperText={error?.message}
                  label="Weight"
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            type="button"
                            aria-label="Read from scale"
                            disabled={scaleMutation.isPending}
                            onClick={() => scaleMutation.mutate()}
                          >
                            <MonitorWeight />
                          </IconButton>
                          g
                        </InputAdornment>
                      ),
                    },
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && justScannedRef.current) {
                      e.preventDefault();
                      justScannedRef.current = false;
                    }
                  }}
                />
              )}
            />
          </Stack>
        </CardContent>
        <CardActions>
          <Button type="submit" variant="contained">
            Submit
          </Button>
          <Button variant="outlined" onClick={() => reset()}>
            Cancel
          </Button>
        </CardActions>
      </Card>
    </Box>
  );
};

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
import { containerKeys } from '../../api/queryKeys';
import type { WeighInDefaults } from '../../types';
import { useRef, useState } from 'react';
import { Close } from '@mui/icons-material';
import { useQueryClient } from '@tanstack/react-query';
import { parseBarcode } from '../shared/parseBarcode';

export const WeighIn = () => {
  const [open, setOpen] = useState(false);
  const { control, handleSubmit, clearErrors, reset, setFocus } = useForm({
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

  const onSubmit: SubmitHandler<WeighInDefaults> = async (data) => {
    const response = await createWeighIn(data);
    if (response.id) {
      setOpen(true);
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
        open={open}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={6000}
        action={
          <IconButton onClick={() => setOpen(false)} color="inherit">
            <Close />
          </IconButton>
        }
      >
        <Alert
          onClose={() => setOpen(false)}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          Weigh in recorded.
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
                      endAdornment: <InputAdornment position="end">g</InputAdornment>,
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

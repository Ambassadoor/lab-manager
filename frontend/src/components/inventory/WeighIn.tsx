import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  IconButton,
  Snackbar,
  Stack,
} from '@mui/material';
import { useFieldArray, useForm, type SubmitHandler } from 'react-hook-form';
import { checkIfDiscarded, createWeighIn } from '../../api/inventory';
import { getBalanceWeight } from '../../api/bridge';
import { containerKeys } from '../../api/queryKeys';
import type { WeighInDefaults } from '../../types';
import { useRef, useState } from 'react';
import { Close } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WeightField } from '../shared/WeightField';
import { ScannableFieldRow } from '../shared/ScannableFieldRow';

type SnackbarState = { message: string; severity: 'success' | 'error' };

export const WeighIn = () => {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const { control, handleSubmit, clearErrors, reset, setFocus, setValue, getValues, resetField } =
    useForm({
      mode: 'onBlur',
      reValidateMode: 'onBlur',
      defaultValues: {
        checkin: [
          {
            slug: '',
            weight: '',
          },
        ],
      },
    });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'checkin',
  });

  const queryClient = useQueryClient();

  // Tracks whether the last onChange was a completed barcode scan, so we only
  // swallow the scanner's own trailing Enter keystroke, not a manual submit.
  const justScannedRef = useRef(false);

  // One shared mutation for every row's WeightField — its own button calls
  // this directly, and onScan (below) also calls it right after a slug
  // scan, so an id scan auto-reads the scale instead of requiring a
  // separate manual click.
  const scaleMutation = useMutation({ mutationFn: getBalanceWeight });

  const onSubmit: SubmitHandler<WeighInDefaults> = async (data) => {
    const response = await createWeighIn(data);
    if (response.readings.length > 0) {
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
          title="Check In"
          subheader="Input your container ID (Chem-##) and weight in grams."
        />
        <CardContent>
          <Stack spacing={2}>
            {fields.map((field, index) => (
              <Stack key={field.id} spacing={2} direction={'row'}>
                <ScannableFieldRow
                  key={field.id}
                  control={control}
                  name={`checkin.${index}.slug`}
                  label={`Item #${index + 1}`}
                  clearErrors={clearErrors}
                  rules={{
                    pattern: {
                      value: /^chem-\d+$/i,
                      message: 'Must match format Chem-####',
                    },
                    validate: {
                      discarded: async (value) => {
                        if (!value || value === '') return;
                        const split = value.toLocaleLowerCase().split('-');
                        const stripped = parseInt(split[1], 10);
                        const joined = split[0] + '-' + String(stripped);
                        const response = await checkIfDiscarded(joined);
                        if (response.is_discarded === true) {
                          return `This container has been discarded. Cannot check in'}.`;
                        } else if (response.is_valid === false) return 'Invalid ID';
                      },
                    },
                  }}
                  onScan={(scannedId, setFieldValue) => {
                    const isDuplicate = getValues('checkin').some(
                      (c) => c.slug.toLocaleLowerCase() === scannedId.toLocaleLowerCase()
                    );
                    if (isDuplicate) {
                      resetField(`checkin.${index}.slug`);
                      return;
                    }
                    setFieldValue(scannedId);
                    setFocus(`checkin.${index}.weight`);
                    scaleMutation.mutate(undefined, {
                      onSuccess: (reading) => {
                        setValue(`checkin.${index}.weight`, String(reading.weight));
                        clearErrors(`checkin.${index}.weight`);
                        append({
                          slug: '',
                          weight: '',
                        });
                      },
                      onError: (error) => {
                        //TODO: Remove setValue and append() just for testing since I don't have scale atm
                        setValue(`checkin.${index}.weight`, '100');
                        append({
                          slug: '',
                          weight: '',
                        });
                        setSnackbar({ message: error.message, severity: 'error' });
                      },
                    });
                  }}
                  showRemove={index > 0}
                  onRemove={() => remove(index)}
                  onAdd={() => {
                    append({ slug: '', weight: '' });
                    setFocus(`checkin.${fields.length}.slug`);
                  }}
                  justScannedRef={justScannedRef}
                />
                <WeightField
                  control={control}
                  name={`checkin.${index}.weight`}
                  setValue={setValue}
                  clearErrors={clearErrors}
                  onError={(message) => setSnackbar({ message, severity: 'error' })}
                  scaleMutation={scaleMutation}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && justScannedRef.current) {
                      e.preventDefault();
                      justScannedRef.current = false;
                    }
                  }}
                />
              </Stack>
            ))}
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

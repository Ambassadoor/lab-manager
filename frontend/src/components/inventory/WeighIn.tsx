import { Alert, Button, IconButton, Snackbar, Stack } from '@mui/material';
import { useFieldArray, useForm, useWatch, type SubmitHandler } from 'react-hook-form';
import { checkIfDiscarded, createWeighIn } from '../../api/inventory';
import { getBalanceWeight } from '../../api/bridge';
import { containerKeys, dashboardKeys } from '../../api/queryKeys';
import type { WeighInDefaults } from '../../types';
import { useRef, useState } from 'react';
import { Close } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WeightField } from '../shared/WeightField';
import { ScannableFieldRow } from '../shared/ScannableFieldRow';
import { ActionFormCard } from '../shared/ActionFormCard';

type SnackbarState = { message: string; severity: 'success' | 'error' };

export const WeighIn = () => {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const {
    control,
    handleSubmit,
    clearErrors,
    reset,
    setFocus,
    setValue,
    getValues,
    resetField,
    formState: { isSubmitting, isValidating },
  } = useForm({
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

  const checkinValues = useWatch({ control, name: 'checkin' });

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
    const checkin = data.checkin.filter((c) => c.slug.trim().length > 0);
    if (checkin.length === 0) return;
    const response = await createWeighIn({ checkin });
    if (response.readings.length > 0) {
      setSnackbar({ message: 'Weigh in recorded.', severity: 'success' });
      reset();
      // .all, not .list() — also refreshes this container's weigh-in history table
      queryClient.invalidateQueries({ queryKey: containerKeys.all });
      // restock_soon on the dashboard depends on percent_remaining, which shifts with every reading
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    }
  };

  // No dynamic tare field here: turned out no container actually needed
  // one. What looked like "680 containers missing a tare value" was really
  // 680 containers with a placeholder tare_weight of 0 (imported from a
  // Notion formula that defaulted missing inputs to 0 instead of blank —
  // see migration 0026_null_placeholder_zero_tare_weights), corrupting
  // percent_remaining for several of them. Fixed at the data layer instead;
  // those containers now correctly show no percent_remaining rather than a
  // wrong one, which was judged an acceptable end state.
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
          severity={snackbar?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
      <ActionFormCard
        title="Check In"
        subheader="Input your container ID (Chem-##) and weight in grams."
        onSubmit={handleSubmit(onSubmit)}
        actions={
          <>
            <Button type="submit" variant="contained" loading={isSubmitting || isValidating}>
              Check In
            </Button>
            <Button variant="outlined" onClick={() => reset()}>
              Cancel
            </Button>
          </>
        }
      >
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
                required={!!checkinValues?.[index]?.slug}
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
      </ActionFormCard>
    </>
  );
};

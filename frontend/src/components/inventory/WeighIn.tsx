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
import { RhfTextField } from '../shared/RhfTextField';
import { decimalPatternRule } from '../shared/formRules';

type SnackbarState = { message: string; severity: 'success' | 'error' };

export const WeighIn = () => {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  // Keyed by each row's stable RHF field.id (not array index, which shifts
  // under add/remove) — true once a scanned row's container is confirmed to
  // have no real tare weight yet, per Container.has_estimated_usage.
  const [needsTare, setNeedsTare] = useState<Record<string, boolean>>({});
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
          tare_weight: '',
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
                      if (!value || value === '') {
                        setNeedsTare((prev) => ({ ...prev, [field.id]: false }));
                        return;
                      }
                      const split = value.toLocaleLowerCase().split('-');
                      const stripped = parseInt(split[1], 10);
                      const joined = split[0] + '-' + String(stripped);
                      const response = await checkIfDiscarded(joined);
                      if (response.is_discarded === true) {
                        setNeedsTare((prev) => ({ ...prev, [field.id]: false }));
                        return `This container has been discarded. Cannot check in'}.`;
                      } else if (response.is_valid === false) {
                        setNeedsTare((prev) => ({ ...prev, [field.id]: false }));
                        return 'Invalid ID';
                      }
                      setNeedsTare((prev) => ({
                        ...prev,
                        [field.id]: !response.has_estimated_usage,
                      }));
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
                        tare_weight: '',
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
                  append({ slug: '', weight: '', tare_weight: '' });
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
              {needsTare[field.id] && (
                <RhfTextField
                  control={control}
                  name={`checkin.${index}.tare_weight`}
                  label="Tare Weight (g)"
                  rules={{ pattern: decimalPatternRule() }}
                  clearErrors={clearErrors}
                />
              )}
            </Stack>
          ))}
        </Stack>
      </ActionFormCard>
    </>
  );
};

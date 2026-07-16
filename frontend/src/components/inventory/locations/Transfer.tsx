import { Close } from '@mui/icons-material';
import { Alert, Button, IconButton, MenuItem, Snackbar, Stack, TextField } from '@mui/material';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { containerKeys, locationKeys } from '../../../api/queryKeys';
import { getLocationMenu, transferContainers } from '../../../api/inventory';
import { ScannableFieldRow } from '../../shared/ScannableFieldRow';
import { ActionFormCard } from '../../shared/ActionFormCard';

type SnackbarState = { message: string; severity: 'success' | 'error' };

export const Transfer = () => {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const queryClient = useQueryClient();
  const {
    control,
    clearErrors,
    reset,
    resetField,
    handleSubmit,
    setFocus,
    getValues,
    setValue,
    formState: { isSubmitting },
  } = useForm({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      location: '',
      containers: [
        {
          slug: '',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'containers',
  });

  const { data: locationMenu } = useQuery({
    queryKey: locationKeys.menu(),
    queryFn: getLocationMenu,
  });

  // Shared across every row (not created per-row) — a completed scan on one
  // row can append a new row whose autoFocus shifts focus there before the
  // scanner's trailing Enter arrives, so whichever row has focus needs to
  // see the same ref to know it should swallow that Enter.
  const justScannedRef = useRef(false);

  const onSubmit = async (data: { containers: { slug: string }[]; location: string }) => {
    try {
      const response = await transferContainers(data);
      if (response.length > 0) {
        setSnackbar({ message: 'Containers transferred.', severity: 'success' });
        reset();
        queryClient.invalidateQueries({ queryKey: containerKeys.list() });
      }
    } catch (error) {
      setSnackbar({
        message: error instanceof Error ? error.message : 'Failed to transfer containers.',
        severity: 'error',
      });
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
        title={'Transfer Location'}
        subheader={`Add ID's of containers you are moving.`}
        onSubmit={handleSubmit(onSubmit)}
        actions={
          <>
            <Button type="submit" variant="contained" loading={isSubmitting}>
              Transfer
            </Button>
            <Button variant="outlined" onClick={() => reset()}>
              Cancel
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          {fields.map((field, index) => (
            <ScannableFieldRow
              key={field.id}
              control={control}
              name={`containers.${index}.slug`}
              label={`Container #${index + 1}`}
              clearErrors={clearErrors}
              onScan={(scannedId, setFieldValue) => {
                const isDuplicate = getValues('containers').some(
                  (c) => c.slug.toLocaleLowerCase() === scannedId.toLocaleLowerCase()
                );
                if (isDuplicate) {
                  resetField(`containers.${index}.slug`);
                  return;
                } else if (scannedId.toLocaleLowerCase().includes('loc')) {
                  setValue('location', scannedId.split('-')[1]);
                  handleSubmit(onSubmit)();
                  resetField(`containers.${index}.slug`);
                  return;
                }
                setFieldValue(scannedId);
                append({ slug: '' });
              }}
              showRemove={index > 0}
              onRemove={() => remove(index)}
              onAdd={() => {
                append({ slug: '' });
                setFocus(`containers.${fields.length}.slug`);
              }}
              justScannedRef={justScannedRef}
            />
          ))}
        </Stack>
        <Controller
          control={control}
          name="location"
          render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
            <TextField
              {...field}
              fullWidth
              error={!!error}
              helperText={error?.message}
              label="New Location"
              onChange={(e) => {
                onChange(e);
                clearErrors(name);
              }}
              select
              sx={{
                mt: 2,
              }}
            >
              {locationMenu ? (
                locationMenu.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.full_path}
                  </MenuItem>
                ))
              ) : (
                <MenuItem>Loading</MenuItem>
              )}
            </TextField>
          )}
        />
      </ActionFormCard>
    </>
  );
};

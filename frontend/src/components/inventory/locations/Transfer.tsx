import { Button, MenuItem, Stack, TextField } from '@mui/material';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { locationKeys } from '../../../api/queryKeys';
import { getLocationMenu, transferContainers } from '../../../api/inventory';
import { ScannableFieldRow } from '../../shared/ScannableFieldRow';
import { ActionFormCard } from '../../shared/ActionFormCard';

export const Transfer = () => {
  const { control, clearErrors, reset, resetField, handleSubmit, setFocus, getValues, setValue } =
    useForm({
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
    const response = await transferContainers(data);
    console.log(response);
  };

  return (
    <ActionFormCard
      title={'Transfer Location'}
      subheader={`Add ID's of containers you are moving.`}
      onSubmit={handleSubmit(onSubmit)}
      actions={
        <>
          <Button type="submit" variant="contained">
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
  );
};

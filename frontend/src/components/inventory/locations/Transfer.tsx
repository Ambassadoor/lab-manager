import { Close } from '@mui/icons-material';
import {
  Alert,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { containerKeys, locationKeys } from '../../../api/queryKeys';
import { getLocationMenu, transferContainers } from '../../../api/inventory';
import { ScannableFieldRow } from '../../shared/ScannableFieldRow';
import { ActionFormCard } from '../../shared/ActionFormCard';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { useConfirmDialog } from '../../shared/useConfirmDialog';

type SnackbarState = { message: string; severity: 'success' | 'error' };
type TransferTarget = { containers: { slug: string }[]; location: string };

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
    formState: { isSubmitting, errors },
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

  // Holds the batch awaiting confirmation — the parent-location field also
  // fires this on a "double scan" (see onScan below), not just the Transfer
  // button, so both paths funnel through the same confirm gate.
  const transferConfirm = useConfirmDialog<TransferTarget>();

  const mutation = useMutation({
    mutationFn: (data: TransferTarget) => transferContainers(data),
    onSuccess: (response) => {
      if (response.length > 0) {
        setSnackbar({ message: 'Containers transferred.', severity: 'success' });
        reset();
        queryClient.invalidateQueries({ queryKey: containerKeys.list() });
      }
      transferConfirm.cancel();
    },
  });

  const onSubmit = (data: TransferTarget) => {
    const containers = data.containers.filter((c) => c.slug.trim().length > 0);
    if (containers.length === 0) return;
    transferConfirm.request({ ...data, containers });
  };

  return (
    <>
      <ConfirmDialog
        open={transferConfirm.isOpen}
        title="Confirm transfer"
        maxWidth="xs"
        message={
          transferConfirm.target && (
            <>
              <Typography variant="body1">
                Transfer {transferConfirm.target.containers.length} container
                {transferConfirm.target.containers.length !== 1 ? 's' : ''} to{' '}
                {locationMenu?.find((l) => String(l.id) === transferConfirm.target?.location)
                  ?.full_path ?? transferConfirm.target.location}
                ?
              </Typography>
              <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                {transferConfirm.target.containers.map((c) => (
                  <ListItem key={c.slug} disableGutters>
                    <ListItemText primary={c.slug.toUpperCase()} />
                  </ListItem>
                ))}
              </List>
            </>
          )
        }
        confirmLabel="Transfer"
        confirmColor="primary"
        loading={mutation.isPending}
        error={mutation.isError ? mutation.error.message : null}
        onCancel={() => {
          mutation.reset();
          transferConfirm.cancel();
        }}
        onConfirm={() => {
          if (transferConfirm.target) mutation.mutate(transferConfirm.target);
        }}
      />
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
            <Button
              type="submit"
              variant="contained"
              loading={isSubmitting}
              disabled={!!errors.containers || !!errors.location}
            >
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
                  remove(index);
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
          rules={{
            required: {
              value: true,
              message: 'Required',
            },
          }}
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

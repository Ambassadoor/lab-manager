import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import {
  Alert,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { ActionFormCard } from '../../shared/ActionFormCard';
import { ScannableFieldRow } from '../../shared/ScannableFieldRow';
import { locationKeys } from '../../../api/queryKeys';
import { moveLocations } from '../../../api/inventory';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { useConfirmDialog } from '../../shared/useConfirmDialog';

type SnackbarState = { message: string; severity: 'success' | 'error' };
type MoveTarget = { childLocations: { slug: string }[]; parentLocation: string };

export const Move = () => {
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
      childLocations: [
        {
          slug: '',
        },
      ],
      parentLocation: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'childLocations',
  });

  const justScannedRef = useRef(false);

  // Holds the batch awaiting confirmation — the parent-location row also
  // fires this on a "double scan" (see onScan below), not just the Move
  // button, so both paths funnel through the same confirm gate.
  const moveConfirm = useConfirmDialog<MoveTarget>();

  const mutation = useMutation({
    mutationFn: (data: MoveTarget) => moveLocations(data),
    onSuccess: (response) => {
      if (response.length > 0) {
        setSnackbar({ message: 'Locations moved.', severity: 'success' });
        reset();
        queryClient.invalidateQueries({ queryKey: locationKeys.list() });
      }
      moveConfirm.cancel();
    },
  });

  const onSubmit = (data: MoveTarget) => {
    const childLocations = data.childLocations.filter((c) => c.slug.trim().length > 0);
    if (childLocations.length === 0) return;
    moveConfirm.request({ ...data, childLocations });
  };

  return (
    <>
      <ConfirmDialog
        open={moveConfirm.isOpen}
        title="Confirm move"
        maxWidth="xs"
        message={
          moveConfirm.target && (
            <>
              <Typography variant="body1">
                Move {moveConfirm.target.childLocations.length} location
                {moveConfirm.target.childLocations.length !== 1 ? 's' : ''} under{' '}
                {moveConfirm.target.parentLocation}?
              </Typography>
              <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                {moveConfirm.target.childLocations.map((c) => (
                  <ListItem key={c.slug} disableGutters>
                    <ListItemText primary={c.slug.toUpperCase()} />
                  </ListItem>
                ))}
              </List>
            </>
          )
        }
        confirmLabel="Move"
        confirmColor="primary"
        loading={mutation.isPending}
        error={mutation.isError ? mutation.error.message : null}
        onCancel={() => {
          mutation.reset();
          moveConfirm.cancel();
        }}
        onConfirm={() => {
          if (moveConfirm.target) mutation.mutate(moveConfirm.target);
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
        title={'Move Location'}
        subheader={
          'Add IDs of locations to be moved and new parent. For Scanning: Scan all locations being moved, then double scan new parent location.'
        }
        onSubmit={handleSubmit(onSubmit)}
        actions={
          <>
            <Button
              type="submit"
              variant="contained"
              loading={isSubmitting}
              disabled={!!errors.childLocations || !!errors.parentLocation}
            >
              Move
            </Button>
            <Button variant="outlined" onClick={() => reset()}>
              Cancel
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          {fields.map((_, index) => (
            <ScannableFieldRow
              control={control}
              name={`childLocations.${index}.slug`}
              label={`Location #${index + 1}`}
              clearErrors={clearErrors}
              onScan={(scannedId, setFieldValue) => {
                const normalizedScan = scannedId.toLocaleLowerCase();
                const childLocations = getValues('childLocations');
                const isConsecutiveDuplicate =
                  childLocations[index - 1]?.slug.toLocaleLowerCase() === normalizedScan;

                if (isConsecutiveDuplicate) {
                  // Same ID scanned twice in a row: drop this row and any
                  // earlier rows referencing that ID, then submit with it
                  // as the parent location.
                  const matchingIndexes = childLocations.reduce<number[]>((acc, c, i) => {
                    if (i < index && c.slug.toLocaleLowerCase() === normalizedScan) acc.push(i);
                    return acc;
                  }, []);
                  remove([...matchingIndexes, index]);
                  setValue('parentLocation', scannedId);
                  handleSubmit(onSubmit)();
                  return;
                }

                const isDuplicateElsewhere = childLocations.some(
                  (c, i) => i !== index && c.slug.toLocaleLowerCase() === normalizedScan
                );
                if (isDuplicateElsewhere) {
                  // Same ID scanned again, but not back-to-back: ignore it.
                  resetField(`childLocations.${index}.slug`);
                  return;
                }

                setFieldValue(scannedId);
                append({ slug: '' });
              }}
              showRemove={index > 0}
              onRemove={() => remove(index)}
              onAdd={() => {
                append({ slug: '' });
                setFocus(`childLocations.${fields.length}.slug`);
              }}
              justScannedRef={justScannedRef}
            />
          ))}
          <Controller
            control={control}
            name="parentLocation"
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
                label="Parent Location"
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
                sx={{
                  mt: 2,
                }}
              />
            )}
          />
        </Stack>
      </ActionFormCard>
    </>
  );
};

import { Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useForm } from 'react-hook-form';
import { discardContainer, restoreContainer } from '../../api/inventory';
import { containerKeys, dashboardKeys, locationKeys } from '../../api/queryKeys';
import type { Container } from '../../types';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { RhfDateField } from '../shared/RhfDateField';

type DiscardDialogProps = {
  container: Container;
  open: boolean;
  onClose: () => void;
};

// Marks a container discarded (asking when), or restores one that is
// discarded. Coordinator and up; the server checks too. A discarded
// container drops out of every list and can't be checked out, checked in
// or moved, but keeps its history.
export const DiscardDialog = ({ container, open, onClose }: DiscardDialogProps) => {
  const qc = useQueryClient();
  const discarded = !!container.date_discarded;
  const { control, handleSubmit, reset } = useForm<{ date: Dayjs | null }>({
    defaultValues: { date: dayjs() },
  });

  const mutation = useMutation({
    mutationFn: (date: string | undefined) =>
      discarded ? restoreContainer(container.slug) : discardContainer(container.slug, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: containerKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      qc.invalidateQueries({ queryKey: locationKeys.all });
      reset();
      onClose();
    },
  });

  const close = () => {
    mutation.reset();
    reset();
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={discarded ? `Restore ${container.label}?` : `Discard ${container.label}?`}
      message={
        discarded ? (
          <Typography>
            It goes back into the inventory lists and can be checked out and moved again.
          </Typography>
        ) : (
          <Stack spacing={2}>
            <Typography>
              {container.name} leaves the inventory lists and can't be checked out, checked in or
              moved. Its history is kept, and it can be restored.
            </Typography>
            <RhfDateField
              control={control}
              name="date"
              label="Discarded on"
              disableFuture
              rules={{ required: 'Required' }}
            />
          </Stack>
        )
      }
      confirmLabel={discarded ? 'Restore' : 'Discard'}
      confirmColor={discarded ? 'primary' : 'error'}
      loading={mutation.isPending}
      error={mutation.isError ? mutation.error.message : null}
      onCancel={close}
      onConfirm={handleSubmit(({ date }) => mutation.mutate(date?.format('YYYY-MM-DD')))}
    />
  );
};

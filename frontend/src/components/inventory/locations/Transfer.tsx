import { Alert, Box, Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { getLocationMenu, transferContainers } from '../../../api/inventory';
import { containerKeys, dashboardKeys, locationKeys } from '../../../api/queryKeys';
import { useScanHandler, useScanner } from '../../../scanner/ScannerContext';
import type { ScanTarget } from '../../../scanner/identify';
import type { Container } from '../../../types';
import { ActionFormCard } from '../../shared/ActionFormCard';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { LocationSelect } from '../../shared/LocationSelect';
import { StorageConflictWarnings } from '../../shared/StorageConflictWarnings';
import { useConfirmDialog } from '../../shared/useConfirmDialog';
import { useStorageConflictConfirm } from '../../shared/useStorageConflictConfirm';
import { AddByIdField } from '../../shared/scanList/AddByIdField';
import { lookUpContainer } from '../../shared/scanList/lookups';
import { ScanListView } from '../../shared/scanList/ScanListView';
import { useScanList, type ScanItem } from '../../shared/scanList/useScanList';

type TransferTarget = { items: ScanItem<Container>[]; location: string };

// Move Containers: scan the containers, then scan the shelf they're going
// to. Scanning a location sets the destination and asks to confirm; it can
// also be picked from the list.
export const Transfer = () => {
  const qc = useQueryClient();
  const { notify } = useScanner();
  const list = useScanList(lookUpContainer);
  const { control, clearErrors, setValue, reset } = useForm({ defaultValues: { location: '' } });
  const location = useWatch({ control, name: 'location' });

  const { data: locationMenu } = useQuery({
    queryKey: locationKeys.menu(),
    queryFn: getLocationMenu,
  });
  const pathOf = (id: string) => locationMenu?.find((l) => String(l.id) === id)?.full_path ?? id;

  const transferConfirm = useConfirmDialog<TransferTarget>();
  // A batch that passes "confirm transfer" can still 409 on a storage rule
  // (backend/apps/inventory/storage_rules.py), which gets its own confirm.
  const storageConflict = useStorageConflictConfirm();

  const mutation = useMutation({
    mutationFn: ({ data, confirmed }: { data: TransferTarget; confirmed?: boolean }) =>
      transferContainers(
        {
          containers: data.items.map((item) => ({ slug: item.detail?.slug ?? '' })),
          location: data.location,
        },
        confirmed
      ),
    onSuccess: (response, { data }) => {
      qc.invalidateQueries({ queryKey: containerKeys.all });
      qc.invalidateQueries({ queryKey: locationKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      notify(
        `Moved ${response.length} container${response.length !== 1 ? 's' : ''} to ${pathOf(data.location)}.`,
        'success'
      );
      list.clear();
      reset();
      transferConfirm.cancel();
    },
    onError: (error, { data }) => {
      // The storage-conflict dialog takes over from the transfer one.
      const handled = storageConflict.intercept(error, () =>
        mutation.mutate({ data, confirmed: true })
      );
      if (handled) transferConfirm.cancel();
    },
  });

  const canSubmit =
    list.ready.length > 0 && !list.isLooking && !list.hasProblems && location !== '';

  const requestTransfer = (destination: string) => {
    mutation.reset();
    transferConfirm.request({ items: list.ready, location: destination });
  };

  const addItem = (target: ScanTarget) => {
    if (!list.add(target)) notify(`${target.label} is already in the list`, 'info');
  };

  useScanHandler(
    (target) => {
      if (!target) return false;
      if (transferConfirm.isOpen || storageConflict.isOpen) {
        notify('Confirm or cancel the transfer first', 'warning');
        return;
      }
      if (target.kind === 'container') {
        addItem(target);
        return;
      }
      // A location: the destination.
      const destination = locationMenu?.find((l) => l.id === target.id);
      if (!destination) {
        notify(`No location ${target.label}`, 'warning');
        return;
      }
      setValue('location', String(destination.id));
      clearErrors('location');
      if (list.ready.length > 0 && !list.isLooking && !list.hasProblems) {
        requestTransfer(String(destination.id));
        // Closes the camera, if open, so the confirm dialog is in view
        return 'done';
      } else {
        notify(`Destination: ${destination.full_path}`, 'success');
      }
    },
    { continuous: true }
  );

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
                Move {transferConfirm.target.items.length} container
                {transferConfirm.target.items.length !== 1 ? 's' : ''} to{' '}
                {pathOf(transferConfirm.target.location)}?
              </Typography>
              <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                {transferConfirm.target.items.map((item) => (
                  <ListItem key={item.key} disableGutters>
                    <ListItemText primary={item.target.label} secondary={item.detail?.name} />
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
          if (transferConfirm.target) {
            mutation.mutate({ data: transferConfirm.target, confirmed: false });
          }
        }}
      />
      <ConfirmDialog
        open={storageConflict.isOpen}
        title="Storage Conflict"
        message={
          storageConflict.warnings && (
            <StorageConflictWarnings warnings={storageConflict.warnings} />
          )
        }
        confirmLabel="Transfer anyway"
        confirmColor="warning"
        onCancel={() => {
          mutation.reset();
          storageConflict.cancel();
        }}
        onConfirm={storageConflict.confirm}
      />
      <ActionFormCard
        title="Move Containers"
        subheader="Scan the containers, then scan the location they're going to."
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) requestTransfer(location);
        }}
        actions={
          <>
            <Button type="submit" variant="contained" disabled={!canSubmit}>
              Transfer
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                list.clear();
                reset();
              }}
              disabled={list.items.length === 0 && location === ''}
            >
              Clear
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          <AddByIdField
            accepts={(t) => t.kind === 'container'}
            describeAccepted="containers (pick the destination below)"
            placeholder="CHEM-12, CHEM-13"
            onAdd={addItem}
          />
          {list.hasProblems && (
            <Alert severity="warning">Remove the items marked in red to continue.</Alert>
          )}
          <ScanListView
            items={list.items}
            onRemove={list.remove}
            emptyText="Scan a container to start."
            describe={(c) => ({ primary: c.name, secondary: `Now in ${c.location.full_path}` })}
          />
          <Box>
            <LocationSelect
              control={control}
              name="location"
              label="Destination"
              placeholder="Scan a location, or choose one"
              clearErrors={clearErrors}
              fullWidth
            />
          </Box>
        </Stack>
      </ActionFormCard>
    </>
  );
};

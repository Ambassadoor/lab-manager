import { Alert, Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkOutContainers } from '../../api/inventory';
import { containerKeys, dashboardKeys } from '../../api/queryKeys';
import { useScanHandler, useScanner } from '../../scanner/ScannerContext';
import type { ScanTarget } from '../../scanner/identify';
import type { Container } from '../../types';
import { ActionFormCard } from '../shared/ActionFormCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useConfirmDialog } from '../shared/useConfirmDialog';
import { AddByIdField } from '../shared/scanList/AddByIdField';
import { lookUpContainer } from '../shared/scanList/lookups';
import { ScanListView } from '../shared/scanList/ScanListView';
import { useScanList, type ScanItem } from '../shared/scanList/useScanList';

// Check Out: scan (or type) the containers being taken, then confirm.
export const Checkout = () => {
  const qc = useQueryClient();
  const { notify } = useScanner();
  const list = useScanList(lookUpContainer);
  const checkoutConfirm = useConfirmDialog<ScanItem<Container>[]>();

  const mutation = useMutation({
    mutationFn: (slugs: string[]) => checkOutContainers(slugs),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: containerKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      notify(
        `Checked out ${response.events.length} container${response.events.length !== 1 ? 's' : ''}.`,
        'success'
      );
      list.clear();
      checkoutConfirm.cancel();
    },
  });

  const addItem = (target: ScanTarget) => {
    if (!list.add(target)) notify(`${target.label} is already in the list`, 'info');
  };

  useScanHandler(
    (target) => {
      if (!target) return false;
      if (checkoutConfirm.isOpen) {
        notify('Confirm or cancel the checkout first', 'warning');
        return;
      }
      if (target.kind !== 'container') {
        notify(`${target.label} is a location. Check Out takes containers.`, 'info');
        return;
      }
      addItem(target);
    },
    { continuous: true }
  );

  const canSubmit = list.ready.length > 0 && !list.isLooking && !list.hasProblems;

  return (
    <>
      <ConfirmDialog
        open={checkoutConfirm.isOpen}
        title="Confirm checkout"
        maxWidth="xs"
        message={
          checkoutConfirm.target && (
            <>
              <Typography variant="body1">
                Check out {checkoutConfirm.target.length} container
                {checkoutConfirm.target.length !== 1 ? 's' : ''}?
              </Typography>
              <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                {checkoutConfirm.target.map((item) => (
                  <ListItem key={item.key} disableGutters>
                    <ListItemText primary={item.target.label} secondary={item.detail?.name} />
                  </ListItem>
                ))}
              </List>
            </>
          )
        }
        confirmLabel="Check Out"
        confirmColor="primary"
        loading={mutation.isPending}
        error={mutation.isError ? mutation.error.message : null}
        onCancel={() => {
          mutation.reset();
          checkoutConfirm.cancel();
        }}
        onConfirm={() => {
          if (checkoutConfirm.target) {
            mutation.mutate(checkoutConfirm.target.flatMap((item) => item.detail?.slug ?? []));
          }
        }}
      />
      <ActionFormCard
        title="Check Out"
        subheader="Scan the containers you're taking, or add them by ID."
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) checkoutConfirm.request(list.ready);
        }}
        actions={
          <>
            <Button type="submit" variant="contained" disabled={!canSubmit}>
              Check Out
            </Button>
            <Button variant="outlined" onClick={list.clear} disabled={list.items.length === 0}>
              Clear
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          <AddByIdField
            accepts={(t) => t.kind === 'container'}
            describeAccepted="containers"
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
            describe={(c) => ({
              primary: c.name,
              secondary: c.location.full_path,
              warning:
                c.checkout_status?.action === 'out'
                  ? `Already checked out by ${c.checkout_status.user.full_name}`
                  : undefined,
            })}
          />
        </Stack>
      </ActionFormCard>
    </>
  );
};

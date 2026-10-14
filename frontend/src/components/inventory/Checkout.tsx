import { Alert, Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkOutContainers, type CheckoutHolder } from '../../api/inventory';
import { containerKeys, dashboardKeys } from '../../api/queryKeys';
import { useScanHandler, useScanner } from '../../scanner/ScannerContext';
import type { ScanTarget } from '../../scanner/identify';
import type { Container } from '../../types';
import { ActionFormCard } from '../shared/ActionFormCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useConfirmDialog } from '../shared/useConfirmDialog';
import { AddByIdField } from '../shared/scanList/AddByIdField';
import { lookUpUsableContainer } from '../shared/scanList/lookups';
import { ScanListView } from '../shared/scanList/ScanListView';
import { useScanList, type ScanItem } from '../shared/scanList/useScanList';
import { HolderField } from './HolderField';
import { useCheckoutHolder } from './useCheckoutHolder';
import { lipscombIdFrom } from '../../scanner/lipscombId';

type CheckoutTarget = {
  items: ScanItem<Container>[];
  holder: CheckoutHolder;
  // Who, as shown back: their account's name, or the name given
  display: string;
};

// Check Out: who is taking them (Lipscomb ID or name), then scan (or type)
// the containers, then confirm.
export const Checkout = () => {
  const qc = useQueryClient();
  const { notify } = useScanner();
  const list = useScanList(lookUpUsableContainer);
  const holder = useCheckoutHolder();
  const checkoutConfirm = useConfirmDialog<CheckoutTarget>();

  const mutation = useMutation({
    mutationFn: (target: CheckoutTarget) =>
      checkOutContainers(
        target.items.flatMap((item) => item.detail?.slug ?? []),
        target.holder
      ),
    onSuccess: (response, target) => {
      qc.invalidateQueries({ queryKey: containerKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      notify(
        `Checked out ${response.events.length} container${response.events.length !== 1 ? 's' : ''} to ${target.display}.`,
        'success'
      );
      list.clear();
      holder.clear();
      checkoutConfirm.cancel();
    },
  });

  const addItem = (target: ScanTarget) => {
    if (!list.add(target)) notify(`${target.label} is already in the list`, 'info');
  };

  useScanHandler(
    (target, raw) => {
      if (!target) {
        // Not a label: maybe an ID card, for who's taking them
        const lipscombId = lipscombIdFrom(raw);
        if (!lipscombId) return false;
        holder.setInput(lipscombId);
        // Says what the scan did, not that anything was checked out yet;
        // the field shows who it is. Mostly for the camera, which covers it.
        notify(`ID card read into "Checked out by": ${lipscombId}`, 'info');
        return;
      }
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
    // ID cards: the camera reads their barcodes here too
    { continuous: true, idCards: true }
  );

  const canSubmit =
    list.ready.length > 0 && !list.isLooking && !list.hasProblems && holder.holder !== null;

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
                Check out {checkoutConfirm.target.items.length} container
                {checkoutConfirm.target.items.length !== 1 ? 's' : ''} to{' '}
                <strong>{checkoutConfirm.target.display}</strong>?
              </Typography>
              <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                {checkoutConfirm.target.items.map((item) => (
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
          if (checkoutConfirm.target) mutation.mutate(checkoutConfirm.target);
        }}
      />
      <ActionFormCard
        title="Check Out"
        subheader="Say who's taking them, then scan the containers or add them by ID."
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && holder.holder) {
            checkoutConfirm.request({
              items: list.ready,
              holder: holder.holder,
              display: holder.display,
            });
          }
        }}
        actions={
          <>
            <Button type="submit" variant="contained" disabled={!canSubmit}>
              Check Out
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                list.clear();
                holder.clear();
              }}
              disabled={list.items.length === 0 && holder.input === ''}
            >
              Clear
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          <HolderField holder={holder} />
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
                  ? `Already checked out by ${c.checkout_status.holder_display}`
                  : undefined,
            })}
          />
        </Stack>
      </ActionFormCard>
    </>
  );
};

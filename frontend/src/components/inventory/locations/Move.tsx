import { Alert, Box, Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { getLocationMenu, moveLocations } from '../../../api/inventory';
import { containerKeys, locationKeys } from '../../../api/queryKeys';
import { useScanHandler, useScanner } from '../../../scanner/ScannerContext';
import type { ScanTarget } from '../../../scanner/identify';
import { ActionFormCard } from '../../shared/ActionFormCard';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { LocationSelect } from '../../shared/LocationSelect';
import { useConfirmDialog } from '../../shared/useConfirmDialog';
import { AddByIdField } from '../../shared/scanList/AddByIdField';
import { lookUpLocation, type LocationSummary } from '../../shared/scanList/lookups';
import { ScanListView } from '../../shared/scanList/ScanListView';
import { targetKey, useScanList, type ScanItem } from '../../shared/scanList/useScanList';

type MoveTarget = { items: ScanItem<LocationSummary>[]; parent: string };

// Every location's barcode is LOC-<id>; the move endpoint finds locations
// by barcode.
const barcodeOf = (id: number | string) => `LOC-${id}`;

// Move Locations: scan the locations to move, then scan the new parent
// twice in a row. The second scan of the same label makes it the parent
// and asks to confirm. The parent can also be picked from the list.
export const Move = () => {
  const qc = useQueryClient();
  const { notify } = useScanner();
  const resolve = useCallback((target: ScanTarget) => lookUpLocation(qc, target), [qc]);
  const list = useScanList(resolve);
  const { control, clearErrors, setValue, reset } = useForm({ defaultValues: { parent: '' } });
  const parent = useWatch({ control, name: 'parent' });
  // The previous scan, to spot the same label scanned twice in a row.
  const lastScan = useRef<number | null>(null);

  const { data: locationMenu } = useQuery({
    queryKey: locationKeys.menu(),
    queryFn: getLocationMenu,
  });
  const pathOf = (id: string) => locationMenu?.find((l) => String(l.id) === id)?.full_path ?? id;

  const moveConfirm = useConfirmDialog<MoveTarget>();

  const mutation = useMutation({
    mutationFn: (data: MoveTarget) =>
      moveLocations({
        childLocations: data.items.map((item) => ({ slug: barcodeOf(item.target.id) })),
        parentLocation: barcodeOf(data.parent),
      }),
    onSuccess: (response, data) => {
      qc.invalidateQueries({ queryKey: locationKeys.all });
      qc.invalidateQueries({ queryKey: containerKeys.all });
      notify(
        `Moved ${response.length} location${response.length !== 1 ? 's' : ''} under ${pathOf(data.parent)}.`,
        'success'
      );
      list.clear();
      reset();
      lastScan.current = null;
      moveConfirm.cancel();
    },
  });

  const parentInList = parent !== '' && list.items.some((i) => String(i.target.id) === parent);
  const canSubmit =
    list.ready.length > 0 && !list.isLooking && !list.hasProblems && parent !== '' && !parentInList;

  const requestMove = (newParent: string, items: ScanItem<LocationSummary>[]) => {
    mutation.reset();
    moveConfirm.request({ items, parent: newParent });
  };

  const addItem = (target: ScanTarget) => {
    if (!list.add(target)) notify(`${target.label} is already in the list`, 'info');
  };

  useScanHandler(
    (target) => {
      if (!target) return false;
      if (moveConfirm.isOpen) {
        notify('Confirm or cancel the move first', 'warning');
        return;
      }
      if (target.kind !== 'location') {
        notify(`${target.label} is a container. Move Locations takes locations.`, 'info');
        return;
      }
      if (lastScan.current !== target.id) {
        lastScan.current = target.id;
        addItem(target);
        return;
      }
      // The same location twice in a row: it's the new parent. Its first scan
      // added it to the list, so take it back out.
      lastScan.current = null;
      if (!locationMenu?.some((l) => l.id === target.id)) {
        notify(`No location ${target.label}`, 'warning');
        return;
      }
      list.remove(targetKey(target));
      setValue('parent', String(target.id));
      clearErrors('parent');
      const children = list.ready.filter((item) => item.key !== targetKey(target));
      if (children.length > 0 && !list.isLooking && !list.hasProblems) {
        requestMove(String(target.id), children);
        // Closes the camera, if open, so the confirm dialog is in view
        return 'done';
      } else {
        notify(`New parent: ${pathOf(String(target.id))}`, 'success');
      }
    },
    { continuous: true }
  );

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
                Move {moveConfirm.target.items.length} location
                {moveConfirm.target.items.length !== 1 ? 's' : ''} under{' '}
                {pathOf(moveConfirm.target.parent)}?
              </Typography>
              <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                {moveConfirm.target.items.map((item) => (
                  <ListItem key={item.key} disableGutters>
                    <ListItemText primary={item.target.label} secondary={item.detail?.full_path} />
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
      <ActionFormCard
        title="Move Locations"
        subheader="Scan the locations to move, then scan the new parent twice."
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) requestMove(parent, list.ready);
        }}
        actions={
          <>
            <Button type="submit" variant="contained" disabled={!canSubmit}>
              Move
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                list.clear();
                reset();
                lastScan.current = null;
              }}
              disabled={list.items.length === 0 && parent === ''}
            >
              Clear
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          <AddByIdField
            accepts={(t) => t.kind === 'location'}
            describeAccepted="locations"
            placeholder="LOC-12, LOC-13"
            onAdd={addItem}
          />
          {list.hasProblems && (
            <Alert severity="warning">Remove the items marked in red to continue.</Alert>
          )}
          {parentInList && (
            <Alert severity="warning">
              {pathOf(parent)} is both the new parent and in the list to move. Remove one.
            </Alert>
          )}
          <ScanListView
            items={list.items}
            onRemove={list.remove}
            emptyText="Scan a location to start."
            describe={(l) => ({ primary: l.full_path })}
          />
          <Box>
            <LocationSelect
              control={control}
              name="parent"
              label="New parent"
              placeholder="Scan it twice, or choose one"
              clearErrors={clearErrors}
              fullWidth
            />
          </Box>
        </Stack>
      </ActionFormCard>
    </>
  );
};

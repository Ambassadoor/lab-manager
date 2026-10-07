import { MonitorWeight } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { getBalanceWeight } from '../../api/bridge';
import { checkIfDiscarded, createWeighIn } from '../../api/inventory';
import { containerKeys, dashboardKeys } from '../../api/queryKeys';
import { useScanHandler, useScanner } from '../../scanner/ScannerContext';
import type { ScanTarget } from '../../scanner/identify';
import type { Container, WeighInDefaults } from '../../types';
import { ActionFormCard } from '../shared/ActionFormCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useConfirmDialog } from '../shared/useConfirmDialog';
import { AddByIdField } from '../shared/scanList/AddByIdField';
import { lookUpContainer } from '../shared/scanList/lookups';
import { ScanListView } from '../shared/scanList/ScanListView';
import { useScanList, type ScanItem } from '../shared/scanList/useScanList';

// What Check In needs to know about each container: the container, and
// whether it still lacks a real tare weight (then one can be entered here).
type CheckInDetail = { container: Container; needsTare: boolean };
type Weights = { weight: string; tare: string };
const NO_WEIGHTS: Weights = { weight: '', tare: '' };

const DECIMAL = /^\d+(\.\d+)?$/;

async function lookUpForCheckIn(target: ScanTarget): Promise<CheckInDetail> {
  const [container, status] = await Promise.all([
    lookUpContainer(target),
    target.kind === 'container' ? checkIfDiscarded(target.slug) : Promise.resolve(null),
  ]);
  if (status?.is_discarded) throw new Error(`${target.label} has been discarded`);
  return { container, needsTare: !status?.has_estimated_usage };
}

// Check In: scan each container as it goes on the balance. The scan reads
// the balance into that container's weight, which can still be edited or
// re-read. Typed-in containers are weighed with the scale button.
export const WeighIn = () => {
  const qc = useQueryClient();
  const { notify } = useScanner();
  const list = useScanList(lookUpForCheckIn);
  const [weights, setWeights] = useState<Record<string, Weights>>({});
  const [reading, setReading] = useState<string | null>(null);
  const checkinConfirm = useConfirmDialog<WeighInDefaults['checkin']>();

  const setWeight = (key: string, patch: Partial<Weights>) =>
    setWeights((current) => ({
      ...current,
      [key]: { ...(current[key] ?? NO_WEIGHTS), ...patch },
    }));

  const readScale = useCallback(
    (key: string) => {
      setReading(key);
      getBalanceWeight()
        .then((r) =>
          setWeights((current) => ({
            ...current,
            [key]: { ...(current[key] ?? NO_WEIGHTS), weight: String(r.weight) },
          }))
        )
        .catch((error: Error) => notify(`Couldn't read the balance: ${error.message}`, 'error'))
        .finally(() => setReading(null));
    },
    [notify]
  );

  const mutation = useMutation({
    mutationFn: (checkin: WeighInDefaults['checkin']) => createWeighIn({ checkin }),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: containerKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      notify(
        `Checked in ${response.readings.length} container${response.readings.length !== 1 ? 's' : ''}.`,
        'success'
      );
      list.clear();
      setWeights({});
      checkinConfirm.cancel();
    },
  });

  const addItem = (target: ScanTarget, weighNow: boolean) => {
    const added = list.add(target, weighNow ? (item) => readScale(item.key) : undefined);
    if (!added) notify(`${target.label} is already in the list`, 'info');
  };

  useScanHandler(
    (target) => {
      if (!target) return false;
      if (checkinConfirm.isOpen) {
        notify('Confirm or cancel the check in first', 'warning');
        return;
      }
      if (target.kind !== 'container') {
        notify(`${target.label} is a location. Check In takes containers.`, 'info');
        return;
      }
      // Scanned as it goes on the balance, so read it straight away.
      addItem(target, true);
    },
    { continuous: true }
  );

  const rows = list.ready.map((item) => ({ item, ...(weights[item.key] ?? NO_WEIGHTS) }));
  const weightProblem = rows.some(
    ({ weight, tare }) => !weight || !DECIMAL.test(weight) || (!!tare && !DECIMAL.test(tare))
  );
  const canSubmit =
    list.ready.length > 0 && !list.isLooking && !list.hasProblems && !weightProblem && !reading;

  const renderWeights = (item: ScanItem<CheckInDetail>) => {
    const value = weights[item.key] ?? NO_WEIGHTS;
    const badWeight = !!value.weight && !DECIMAL.test(value.weight);
    const badTare = !!value.tare && !DECIMAL.test(value.tare);
    return (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flex: '1 1 260px' }}>
        <TextField
          size="small"
          label="Weight"
          value={value.weight}
          onChange={(e) => setWeight(item.key, { weight: e.target.value })}
          error={badWeight}
          helperText={badWeight ? 'A number' : undefined}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label={`Read ${item.target.label} from scale`}
                    disabled={!!reading}
                    onClick={() => readScale(item.key)}
                  >
                    <MonitorWeight fontSize="small" />
                  </IconButton>
                  g
                </InputAdornment>
              ),
            },
          }}
          sx={{ flex: 1 }}
        />
        {item.detail?.needsTare && (
          <TextField
            size="small"
            label="Tare weight (g)"
            value={value.tare}
            onChange={(e) => setWeight(item.key, { tare: e.target.value })}
            error={badTare}
            helperText={badTare ? 'A number' : 'Optional: empty container'}
            sx={{ flex: 1 }}
          />
        )}
      </Stack>
    );
  };

  return (
    <>
      <ConfirmDialog
        open={checkinConfirm.isOpen}
        title="Confirm check in"
        maxWidth="xs"
        message={
          checkinConfirm.target && (
            <>
              <Typography variant="body1">
                Record {checkinConfirm.target.length} weigh-in
                {checkinConfirm.target.length !== 1 ? 's' : ''} and check these containers in?
              </Typography>
              <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                {checkinConfirm.target.map((row) => (
                  <ListItem key={row.slug} disableGutters>
                    <ListItemText
                      primary={row.slug.toUpperCase()}
                      secondary={
                        `${row.weight}g` + (row.tare_weight ? ` · tare ${row.tare_weight}g` : '')
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )
        }
        confirmLabel="Check In"
        confirmColor="primary"
        loading={mutation.isPending}
        error={mutation.isError ? mutation.error.message : null}
        onCancel={() => {
          mutation.reset();
          checkinConfirm.cancel();
        }}
        onConfirm={() => {
          if (checkinConfirm.target) mutation.mutate(checkinConfirm.target);
        }}
      />
      <ActionFormCard
        title="Check In"
        subheader="Scan each container as you put it on the balance; its weight is read automatically."
        maxWidth={760}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          checkinConfirm.request(
            rows.map(({ item, weight, tare }) => ({
              slug: item.detail?.container.slug ?? '',
              weight,
              ...(tare ? { tare_weight: tare } : {}),
            }))
          );
        }}
        actions={
          <>
            <Button type="submit" variant="contained" disabled={!canSubmit}>
              Check In
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                list.clear();
                setWeights({});
              }}
              disabled={list.items.length === 0}
            >
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
            onAdd={(target) => addItem(target, false)}
          />
          {list.hasProblems && (
            <Alert severity="warning">Remove the items marked in red to continue.</Alert>
          )}
          {list.ready.length > 0 && weightProblem && !list.hasProblems && (
            <Box>
              <Typography variant="body2" color="text.secondary">
                Every container needs a weight before checking in.
              </Typography>
            </Box>
          )}
          <ScanListView
            items={list.items}
            onRemove={list.remove}
            emptyText="Put a container on the balance and scan it to start."
            describe={({ container }) => ({
              primary: container.name,
              secondary: container.location.full_path,
            })}
            renderExtra={renderWeights}
          />
        </Stack>
      </ActionFormCard>
    </>
  );
};

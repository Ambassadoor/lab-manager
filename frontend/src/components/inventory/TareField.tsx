import { Calculate } from '@mui/icons-material';
import {
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import type { Container } from '../../types';
import { contentMassGrams, estimateTare, isValidTare, percentRemaining } from '../shared/units';
import {
  QUANTITY_UNITS,
  contentsProblem,
  missingContents,
  withContents,
  type Contents,
} from './checkInContents';

const DECIMAL = /^\d+(\.\d+)?$/;

type TareFieldProps = {
  container: Container;
  // The container's weight on the balance now, as typed or read
  weight: string;
  tare: string;
  onTareChange: (tare: string) => void;
  // The quantity/density typed here for a container missing them
  contents: Contents;
  onContentsChange: (contents: Contents) => void;
};

// Check In's tare weight, for a container that doesn't have one yet. It
// can be typed, or estimated from how much of the original contents look
// left: tare = current weight − original contents (g) × % left. Shows the
// percent remaining that tare would give, and warns when it would be
// negative (a tare heavier than the container weighs now). A container
// without its quantity (or, for a volume, density) gets fields for those
// in the estimate row; Check In saves them to the container.
export const TareField = ({
  container,
  weight,
  tare,
  onTareChange,
  contents,
  onContentsChange,
}: TareFieldProps) => {
  const [estimating, setEstimating] = useState(false);
  const [percent, setPercent] = useState('');
  const missing = missingContents(container, contents);
  const massOf = (c: Contents) => contentMassGrams(withContents(container, c));
  const mass = massOf(contents);
  const currentWeight = DECIMAL.test(weight) ? Number(weight) : null;
  const contentsError = contentsProblem(container, contents);

  // Re-estimated whenever the % or the contents change
  const estimate = (value: string, nextMass: number | null) => {
    const pct = Number(value);
    if (value === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) return;
    if (nextMass === null || currentWeight === null) return;
    onTareChange(String(estimateTare(currentWeight, nextMass, pct)));
  };
  const changePercent = (value: string) => {
    setPercent(value);
    estimate(value, mass);
  };
  const changeContents = (patch: Partial<Contents>) => {
    const next = { ...contents, ...patch };
    onContentsChange(next);
    estimate(percent, massOf(next));
  };

  const typedTare = tare !== '' && DECIMAL.test(tare) ? Number(tare) : null;
  const remaining =
    typedTare !== null && currentWeight !== null && mass !== null
      ? percentRemaining(currentWeight, typedTare, mass)
      : null;

  // One message under both fields: an error blocks Check In, a warning
  // doesn't
  let message = 'Optional: the empty container';
  let tone: 'text.secondary' | 'error' | 'warning.main' = 'text.secondary';
  if (contentsError) {
    tone = 'error';
    message = contentsError;
  } else if (tare !== '' && !isValidTare(tare)) {
    tone = 'error';
    message =
      estimating && Number(tare) <= 0
        ? 'That much left would weigh more than the bottle does now; lower the %'
        : 'A number above 0';
  } else if (remaining !== null && remaining < 0) {
    tone = 'warning.main';
    message = 'More than the current weight: percent remaining would be negative';
  } else if (estimating && mass === null) {
    message = `Enter the ${missing.quantity ? 'quantity' : 'density'} to estimate`;
  } else if (remaining !== null) {
    message = estimating
      ? `From ${percent}% of ${mass} g: ≈ ${remaining}% left`
      : `≈ ${remaining}% left`;
  }

  const estimateReason =
    currentWeight === null
      ? 'Read or type the current weight first'
      : 'Estimate from how much is left';

  return (
    <Stack spacing={0.5} sx={{ flex: '1 1 200px', minWidth: 0 }}>
      <Stack spacing={1}>
        <TextField
          size="small"
          label="Tare weight (g)"
          value={tare}
          onChange={(e) => onTareChange(e.target.value)}
          error={tone === 'error'}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={estimateReason}>
                    {/* span: a disabled button can't show a tooltip itself */}
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Estimate ${container.label}'s tare`}
                        aria-pressed={estimating}
                        disabled={currentWeight === null}
                        onClick={() => setEstimating((on) => !on)}
                      >
                        <Calculate fontSize="small" color={estimating ? 'primary' : undefined} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
        {/* Its own row, so opening it never squeezes the tare field */}
        {estimating && (
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
            {missing.quantity && (
              <TextField
                size="small"
                label="Quantity"
                value={contents.quantity}
                onChange={(e) => changeContents({ quantity: e.target.value })}
                sx={{ width: 170 }}
                slotProps={{
                  htmlInput: { inputMode: 'numeric' },
                  input: {
                    endAdornment: (
                      <TextField
                        select
                        variant="standard"
                        value={contents.unit}
                        onChange={(e) => changeContents({ unit: e.target.value })}
                        sx={{ minWidth: 52 }}
                        slotProps={{
                          htmlInput: { 'aria-label': 'Unit' },
                          input: { disableUnderline: true },
                        }}
                      >
                        {QUANTITY_UNITS.map((unit) => (
                          <MenuItem key={unit} value={unit}>
                            {unit}
                          </MenuItem>
                        ))}
                      </TextField>
                    ),
                  },
                }}
              />
            )}
            {missing.density && (
              <TextField
                size="small"
                label="Density"
                value={contents.density}
                onChange={(e) => changeContents({ density: e.target.value })}
                sx={{ width: 140 }}
                slotProps={{
                  htmlInput: { inputMode: 'decimal' },
                  input: { endAdornment: <InputAdornment position="end">g/mL</InputAdornment> },
                }}
              />
            )}
            <TextField
              size="small"
              label="% left"
              value={percent}
              onChange={(e) => changePercent(e.target.value)}
              error={percent !== '' && !(Number(percent) >= 0 && Number(percent) <= 100)}
              sx={{ width: 110 }}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          </Stack>
        )}
      </Stack>
      <Typography variant="caption" color={tone} sx={{ px: 1.75 }}>
        {message}
      </Typography>
    </Stack>
  );
};

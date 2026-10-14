import { Calculate } from '@mui/icons-material';
import { IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import type { Container } from '../../types';
import { contentMassGrams, estimateTare, isValidTare, percentRemaining } from '../shared/units';

const DECIMAL = /^\d+(\.\d+)?$/;

type TareFieldProps = {
  container: Container;
  // The container's weight on the balance now, as typed or read
  weight: string;
  tare: string;
  onTareChange: (tare: string) => void;
};

// Check In's tare weight, for a container that doesn't have one yet. It
// can be typed, or estimated from how much of the original contents look
// left: tare = current weight − original contents (g) × % left. Shows the
// percent remaining that tare would give, and warns when it would be
// negative (a tare heavier than the container weighs now).
export const TareField = ({ container, weight, tare, onTareChange }: TareFieldProps) => {
  const [estimating, setEstimating] = useState(false);
  const [percent, setPercent] = useState('');
  const mass = contentMassGrams(container);
  const currentWeight = DECIMAL.test(weight) ? Number(weight) : null;

  const estimate = (value: string) => {
    setPercent(value);
    const pct = Number(value);
    if (value === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) return;
    if (mass === null || currentWeight === null) return;
    onTareChange(String(estimateTare(currentWeight, mass, pct)));
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
  if (tare !== '' && !isValidTare(tare)) {
    tone = 'error';
    message =
      estimating && Number(tare) <= 0
        ? 'That much left would weigh more than the bottle does now; lower the %'
        : 'A number above 0';
  } else if (remaining !== null && remaining < 0) {
    tone = 'warning.main';
    message = 'More than the current weight: percent remaining would be negative';
  } else if (remaining !== null) {
    message = estimating
      ? `From ${percent}% of ${mass} g: ≈ ${remaining}% left`
      : `≈ ${remaining}% left`;
  }

  const estimateReason =
    mass === null
      ? `Needs the container's quantity${container.quantity_unit?.endsWith('L') ? ' and density' : ''}`
      : currentWeight === null
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
                        disabled={mass === null || currentWeight === null}
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
          <TextField
            size="small"
            label="% left"
            value={percent}
            onChange={(e) => estimate(e.target.value)}
            error={percent !== '' && !(Number(percent) >= 0 && Number(percent) <= 100)}
            sx={{ width: 110 }}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
        )}
      </Stack>
      <Typography variant="caption" color={tone} sx={{ px: 1.75 }}>
        {message}
      </Typography>
    </Stack>
  );
};

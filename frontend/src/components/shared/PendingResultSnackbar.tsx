import { Alert, Snackbar } from '@mui/material';
import { useState } from 'react';
import { takePendingActionResult } from './pendingActionResult';

// Shows (once) whatever setPendingActionResult stashed before the previous
// page navigated here — see that module's comment for why this exists
// instead of a normal page-local Snackbar. Render this on a page that's a
// common landing spot right after a "fire an action, then navigate away"
// flow (e.g. ContainerDetail, after ContainerForm's submit).
export const PendingResultSnackbar = () => {
  // Lazy initializer — runs once, on first mount, so the stashed result is
  // read (and cleared) exactly once even across re-renders.
  const [result] = useState(() => takePendingActionResult());
  const [open, setOpen] = useState(!!result);

  if (!result) return null;

  return (
    <Snackbar
      open={open}
      onClose={() => setOpen(false)}
      autoHideDuration={6000}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={() => setOpen(false)}
        severity={result.severity}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {result.message}
      </Alert>
    </Snackbar>
  );
};

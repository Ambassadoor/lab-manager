import { Alert, Snackbar } from '@mui/material';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PrintConfirmation, PrintParams } from '../../types';

type PrintResultSnackbarProps = {
  // Owned by the caller (created via useMutation({ mutationFn: printLabelChecked })),
  // same reasoning as WeightField's scaleMutation prop — a caller that needs
  // to know when printing finishes (e.g. to re-enable a button) can watch
  // the exact same mutation instance instead of a second, uncoordinated one.
  mutation: UseMutationResult<PrintConfirmation, Error, PrintParams>;
  // What was printed, for the message — e.g. "Location label". Falls back
  // to something generic for a call site that doesn't have anything more
  // specific to say.
  label?: string;
};

// Shared success/failure feedback for every POST /print/label call site
// (see bridge/PRINTER_PLAN.md's "print result feedback everywhere printing
// happens" TODO) — one presentation reused everywhere instead of each page
// inventing its own. Distinguishes success from failure but not *why* a
// failure happened (bridge unreachable, a bad HTTP response, or — thanks to
// printLabelChecked — the printer reporting an error after accepting the
// print); the thrown error's own message, shown verbatim, already does
// that without this component needing to know the difference itself.
export const PrintResultSnackbar = ({ mutation, label = 'Label' }: PrintResultSnackbarProps) => {
  // Derived directly from the mutation, no local open state — a repeat
  // print goes isSuccess/isError -> false (isPending) -> true again while
  // it's in flight, so this naturally reopens on each new attempt even
  // when the outcome is identical to the last one, with no effect needed.
  const open = mutation.isSuccess || mutation.isError;

  const handleClose = () => {
    // Otherwise isSuccess/isError (and the message built from them) stay
    // true forever and this stays permanently open.
    mutation.reset();
  };

  if (!open) return null;

  return (
    <Snackbar
      open={open}
      onClose={handleClose}
      autoHideDuration={6000}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={handleClose}
        severity={mutation.isError ? 'error' : 'success'}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {mutation.isError
          ? `${label} failed to print: ${mutation.error.message}`
          : `${label} sent to printer.`}
      </Alert>
    </Snackbar>
  );
};

import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  type ButtonProps,
  type DialogProps,
} from '@mui/material';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: ButtonProps['color'];
  loading?: boolean;
  error?: string | null;
  // Wider than the "xs" default when the message needs room for a scanned-
  // item summary list rather than a single line of text.
  maxWidth?: DialogProps['maxWidth'];
};

// Generic yes/no gate for any CRUD action worth a second thought (mainly
// deletes and scan-driven bulk submits, but works for any confirm-before-
// mutate flow). Presentational only — pair with useConfirmDialog so callers
// don't hand-roll open state per row/item.
export const ConfirmDialog = ({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'primary',
  loading = false,
  error,
  maxWidth = 'xs',
}: ConfirmDialogProps) => {
  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} maxWidth={maxWidth} fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {/* component="div" — callers (e.g. a scanned-item <List>) may pass
            block-level content, which is invalid inside the default <p>. */}
        <DialogContentText component="div">{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          color={confirmColor}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

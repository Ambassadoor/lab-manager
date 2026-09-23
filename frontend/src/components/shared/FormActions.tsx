import { Button, CardActions } from '@mui/material';

type FormActionsProps = {
  onCancel: () => void;
  // Save stays disabled until something has actually changed
  isDirty: boolean;
  loading?: boolean;
  saveLabel?: string;
};

// Cancel/Save row for the detail pages' edit forms — right-aligned, Cancel
// first, Save as the one contained (primary) button. Must sit inside the
// <form> so Save's type="submit" submits it.
export const FormActions = ({
  onCancel,
  isDirty,
  loading,
  saveLabel = 'Save',
}: FormActionsProps) => (
  <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
    <Button onClick={onCancel}>Cancel</Button>
    <Button type="submit" variant="contained" disabled={!isDirty} loading={loading}>
      {saveLabel}
    </Button>
  </CardActions>
);

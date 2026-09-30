import { Alert, AlertTitle, Stack, Typography } from '@mui/material';

// Shown at the top of every SDS view — hardcoded for the MVP (trivial to
// move to a settings-backed value later if it needs to be editable without
// a deploy). Every page that shows an actual SDS document carries this, on
// the assumption that whoever is looking at one may be doing so because
// they were just exposed to the chemical it covers.
export const SafetyHeader = () => (
  <Alert severity="error" variant="filled" sx={{ mb: 3 }}>
    <AlertTitle>If you have been exposed to this chemical</AlertTitle>
    <Stack spacing={0.5}>
      <Typography variant="body2">
        <strong>Seek medical attention immediately</strong> — do not wait to see if symptoms appear.
      </Typography>
      <Typography variant="body2">
        <strong>Emergency services:</strong> 911
      </Typography>
      <Typography variant="body2">
        <strong>Poison Control:</strong> 1-800-222-1222
      </Typography>
    </Stack>
  </Alert>
);

import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';

type DetailRowProps = {
  label: ReactNode;
  children?: ReactNode;
};

// Read-only label/value row for detail cards — a muted label column beside
// the value, so a stack of these scans as a two-column list rather than a
// run of "Label: value" sentences.
export const DetailRow = ({ label, children }: DetailRowProps) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: '130px 1fr',
      columnGap: 2,
      alignItems: 'center',
    }}
  >
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    {/* div, not p — values can be block content (chips, buttons, links) */}
    <Typography component="div">{children}</Typography>
  </Box>
);

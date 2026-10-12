import { useMediaQuery, useTheme } from '@mui/material';

// Below MUI's `sm` breakpoint (600 px): a phone, or a very narrow window.
// Tablets (the iPad) are above it and get the desktop layout.
export function useIsPhone(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}

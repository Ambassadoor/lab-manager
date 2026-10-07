import { useMediaQuery, useTheme } from '@mui/material';

// For a form dialog's `fullScreen`: on a phone a centred dialog leaves the
// fields only a strip of the screen, and the keyboard covers its buttons.
export function useFullScreenOnPhone(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}

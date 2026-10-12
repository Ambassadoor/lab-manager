import { Box } from '@mui/material';
import { useEffect } from 'react';

// The test site (deploy/pi/README.md, Test site) runs develop's code on a
// copy of the live data. Recognised by its address, so no build setting
// can be forgotten.
const isTestSite = window.location.hostname.startsWith('test.');

// A strip above the nav bar on the test site, so nobody records real work
// there by mistake. Also marks the browser tab.
export const TestSiteBanner = () => {
  useEffect(() => {
    if (isTestSite && !document.title.startsWith('[TEST]')) {
      document.title = `[TEST] ${document.title}`;
    }
  }, []);

  if (!isTestSite) return null;
  return (
    <Box
      role="status"
      sx={{
        bgcolor: 'warning.main',
        color: 'warning.contrastText',
        textAlign: 'center',
        typography: 'body2',
        fontWeight: 'bold',
        px: 2,
        py: 0.5,
      }}
    >
      Test site: changes here don't affect the real inventory.
    </Box>
  );
};

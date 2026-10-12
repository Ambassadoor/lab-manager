import { QrCodeScanner } from '@mui/icons-material';
import { Backdrop, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { lazy, Suspense, useCallback, useState } from 'react';
import { unlockBeep } from './beep';

// The camera view and its QR decoder load only when first opened.
const CameraScanner = lazy(() => import('./CameraScanner'));

// Navbar button that opens the camera to scan labels. Hidden where the
// browser has no camera API: over plain http (it needs https or localhost)
// or in a browser without one.
export const CameraButton = () => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!navigator.mediaDevices?.getUserMedia) return null;

  return (
    <>
      <Tooltip title="Scan with camera">
        <IconButton
          color="inherit"
          aria-label="Scan with camera"
          onClick={() => {
            unlockBeep();
            setOpen(true);
          }}
        >
          <QrCodeScanner />
        </IconButton>
      </Tooltip>
      {open && (
        <Suspense
          fallback={
            <Backdrop open sx={{ zIndex: (theme) => theme.zIndex.modal }}>
              <CircularProgress color="inherit" />
            </Backdrop>
          }
        >
          <CameraScanner onClose={close} />
        </Suspense>
      )}
    </>
  );
};

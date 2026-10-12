import { Close, FlashlightOff, FlashlightOn } from '@mui/icons-material';
import { Alert, Box, Button, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { beep } from './beep';
import { createQrDetector } from './detector';
import { identify } from './identify';
import { createReadFilter } from './readFilter';
import { useScanner } from './ScannerContext';

// How often a frame is decoded; more often only costs battery.
const DECODE_EVERY_MS = 120;

function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return (
      'Camera access is blocked for this site. Allow it, then try again: on an iPhone in ' +
      'Settings › Apps › Safari › Camera, in Chrome from the icon beside the address.'
    );
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found.';
  if (name === 'NotReadableError') return 'The camera is in use by another app.';
  return `Couldn't start the camera: ${error instanceof Error ? error.message : String(error)}`;
}

// Full-screen camera view that reads label QR codes and hands each one to
// the scanner's handlers, exactly like a scan from the barcode scanner. On
// a page that takes a list (the Actions tabs) it stays open between reads;
// elsewhere it closes after one. Loaded only when opened (CameraButton).
export default function CameraScanner({ onClose }: { onClose: () => void }) {
  const { submitScan, wantsContinuous } = useScanner();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null: this camera has no torch
  const [torchOn, setTorchOn] = useState<boolean | null>(null);
  const [reads, setReads] = useState<{ count: number; last: string } | null>(null);
  const continuous = wantsContinuous();

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // A scan that opens a page, or a link tapped meanwhile, ends the scanning
  const { key: routeKey } = useLocation();
  const openedAt = useRef(routeKey);
  useEffect(() => {
    if (routeKey !== openedAt.current) onCloseRef.current();
  }, [routeKey]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    const isNew = createReadFilter();

    const start = async () => {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      const video = videoRef.current;
      if (stopped || !video) return;
      video.srcObject = stream;
      await video.play();
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
      if (capabilities?.torch) setTorchOn(false);
      const detector = await createQrDetector();
      if (stopped) return;
      setStarting(false);

      let lastDecode = 0;
      let busy = false;
      const tick = async (now: number) => {
        if (stopped) return;
        frame = requestAnimationFrame(tick);
        if (busy || now - lastDecode < DECODE_EVERY_MS || video.readyState < 2) return;
        busy = true;
        lastDecode = now;
        try {
          const codes = await detector.detect(video);
          for (const raw of isNew(
            codes.map((c) => c.rawValue),
            now
          )) {
            if (stopped) return;
            beep();
            const outcome = submitScan(raw);
            setReads((r) => ({ count: (r?.count ?? 0) + 1, last: identify(raw)?.label ?? raw }));
            if (outcome === 'done' || !wantsContinuous()) {
              onCloseRef.current();
              return;
            }
          }
        } catch {
          // A frame that couldn't be decoded; try the next
        } finally {
          busy = false;
        }
      };
      frame = requestAnimationFrame(tick);
    };

    start().catch((e: unknown) => {
      if (stopped) return;
      setError(describeCameraError(e));
      setStarting(false);
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [submitScan, wantsContinuous]);

  const toggleTorch = () => {
    const track = trackRef.current;
    if (!track || torchOn === null) return;
    const on = !torchOn;
    track
      .applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      .then(() => setTorchOn(on))
      .catch(() => setTorchOn(null));
  };

  const status = starting
    ? 'Starting the camera…'
    : reads
      ? `${reads.count} scanned · last ${reads.last}`
      : "Point the camera at a label's QR code";

  return (
    <Dialog
      open
      fullScreen
      onClose={onClose}
      slotProps={{ paper: { sx: { bgcolor: 'common.black', color: 'common.white' } } }}
    >
      <Box sx={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <Box
          component="video"
          ref={videoRef}
          playsInline
          muted
          autoPlay
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {!error && (
          // The aiming square; its shadow dims everything around it
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 'min(70vw, 60vh, 320px)',
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
              border: '3px solid rgba(255, 255, 255, 0.9)',
              borderRadius: 2,
              boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.45)',
            }}
          />
        )}
        <Stack
          direction="row"
          sx={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', p: 1 }}
        >
          <Typography variant="h6" sx={{ flexGrow: 1, pl: 1 }}>
            {continuous ? 'Scan labels' : 'Scan a label'}
          </Typography>
          {torchOn !== null && (
            <IconButton
              color="inherit"
              aria-label={torchOn ? 'Turn the light off' : 'Turn the light on'}
              onClick={toggleTorch}
            >
              {torchOn ? <FlashlightOff /> : <FlashlightOn />}
            </IconButton>
          )}
          <IconButton color="inherit" aria-label="Close camera" onClick={onClose}>
            <Close />
          </IconButton>
        </Stack>
        {error ? (
          <Alert severity="error" sx={{ position: 'absolute', top: 72, left: 16, right: 16 }}>
            {error}
          </Alert>
        ) : (
          <Stack
            spacing={1.5}
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: 'center',
              p: 3,
              // Above the iPhone's home bar
              pb: 'max(24px, env(safe-area-inset-bottom))',
            }}
          >
            <Typography align="center">{status}</Typography>
            {continuous && (
              <Button variant="contained" onClick={onClose}>
                Done
              </Button>
            )}
          </Stack>
        )}
      </Box>
    </Dialog>
  );
}

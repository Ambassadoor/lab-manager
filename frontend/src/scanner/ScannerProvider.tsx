import { Alert, Snackbar } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSdsList, NEWEST_SDS_FIRST } from '../api/sds';
import { useAuth } from '../context/AuthContext';
import { identify } from './identify';
import { nextScanStep, type ScanState } from './scanSequence';
import {
  ScannerContext,
  type ScanHandler,
  type ScanMessageSeverity,
  type ScannerContextValue,
} from './ScannerContext';

type Message = { text: string; severity: ScanMessageSeverity };

// Listens for the barcode scanner everywhere in the app. Scans are told
// apart from typing by the scanner's prefix (scanSequence.ts) and handed to
// the most recently registered useScanHandler. With none, or if they all
// pass, a container scan opens the container and a location scan opens the
// Locations page at that location. Logged out, a container scan opens its
// newest SDS instead, since SDS are public safety information. Setting up
// the scanner's prefix is covered in docs/Barcode-Scanner.md.
export function ScannerProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [message, setMessage] = useState<Message | null>(null);

  const notify = useCallback((text: string, severity: ScanMessageSeverity = 'info') => {
    setMessage({ text, severity });
  }, []);

  const handlers = useRef<{ current: ScanHandler }[]>([]);
  const register = useCallback((handler: { current: ScanHandler }) => {
    handlers.current.push(handler);
    return () => {
      handlers.current = handlers.current.filter((h) => h !== handler);
    };
  }, []);

  // The bottom of the stack. Kept in a ref so the key listener below never
  // has to be re-attached when the user or route changes.
  const defaultHandler = useRef<ScanHandler>(() => {});
  useEffect(() => {
    defaultHandler.current = (target, raw) => {
      if (!target) {
        notify(`"${raw}" isn't a container or location label`, 'warning');
      } else if (!user && target.kind === 'container') {
        getSdsList({ container: target.id, ordering: NEWEST_SDS_FIRST })
          .then((sds) => {
            if (sds.length > 0) navigate(`/sds/${sds[0].id}`);
            else notify(`No SDS on file for ${target.label}`, 'info');
          })
          .catch(() => notify(`Couldn't look up the SDS for ${target.label}`, 'error'));
      } else if (!user) {
        notify(`Log in to see what's stored at ${target.label}`, 'info');
      } else if (target.kind === 'container') {
        navigate(`/inventory/containers/${target.slug}`);
      } else {
        navigate(`/inventory/locations/?location=${target.id}`);
      }
    };
  });

  useEffect(() => {
    let state: ScanState = null;

    const dispatch = (raw: string) => {
      const target = identify(raw);
      for (const handler of [...handlers.current].reverse()) {
        if (handler.current(target, raw) !== false) return;
      }
      defaultHandler.current(target, raw);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // An IME composition, or a shortcut like Ctrl+`, is never a scan.
      if (e.isComposing) return;
      if (!state && (e.ctrlKey || e.metaKey || e.altKey)) return;
      const result = nextScanStep(state, e.key, e.timeStamp);
      state = result.state;
      if (result.step.action === 'ignore') return;
      e.preventDefault();
      e.stopPropagation();
      if (result.step.action === 'complete') dispatch(result.step.value);
    };

    // Capture phase: this sees each key before the focused input does, so
    // a scan's characters never reach it.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);

  const value = useMemo<ScannerContextValue>(() => ({ register, notify }), [register, notify]);

  return (
    <ScannerContext.Provider value={value}>
      {children}
      <Snackbar
        open={!!message}
        onClose={() => setMessage(null)}
        autoHideDuration={4000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setMessage(null)}
          severity={message?.severity ?? 'info'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {message?.text}
        </Alert>
      </Snackbar>
    </ScannerContext.Provider>
  );
}

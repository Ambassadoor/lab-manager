import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline } from '@mui/material';
import App from './App';
import { Theme } from './context/Theme';
import { AuthProvider } from './context/AuthProvider';
import { AgGridProvider } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { FeedbackProvider } from './components/feedback/FeedbackProvider';
import {
  buildDiagnostics,
  describe,
  installDiagnostics,
  markRecorded,
  record,
  wasRecorded,
} from './diagnostics';

// Before anything renders, so startup errors land in the bug-report buffer too.
installDiagnostics();
// Dev only: run __diagnostics() in the browser console to see what a bug
// report would send right now.
if (import.meta.env.DEV) Object.assign(window, { __diagnostics: buildDiagnostics });

// Failures that didn't come from apiFetch/bridgeFetch (those record themselves)
// — e.g. an exception thrown while shaping a response inside a queryFn.
function recordQueryError(source: string, key: unknown, error: unknown) {
  if (wasRecorded(error)) return;
  markRecorded(error);
  record(
    'query',
    'error',
    `${source} ${describe(key)} failed: ${describe(error)}`,
    error instanceof Error ? error.stack : undefined
  );
}

//Tanstack queryclient to expire caches after 5 minutes
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => recordQueryError('Query', query.queryKey, error),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      recordQueryError('Mutation', mutation.options.mutationKey ?? '(unkeyed)', error),
  }),
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5 },
  },
});

//Features available in AGGrid
const modules = [AllCommunityModule];

//Various providers for application, i.e. themes, auth, tanstack query, etc
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Theme>
          {/* Must be inside <Theme> — outside it, CssBaseline only sees MUI's
              default light theme and pins `color-scheme: light` on <html>,
              so native scrollbars/controls ignore the dark-mode toggle. */}
          <CssBaseline enableColorScheme />
          <AgGridProvider modules={modules}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              {/* Inside Auth/Query providers — the bug report reads the
                  user's role and the printer status from them. */}
              <FeedbackProvider>
                <App />
              </FeedbackProvider>
            </LocalizationProvider>
          </AgGridProvider>
        </Theme>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

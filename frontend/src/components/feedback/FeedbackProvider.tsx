import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { printerKeys } from '../../api/queryKeys';
import { buildDiagnostics, type Diagnostics } from '../../diagnostics';
import { FeedbackContext, type BugReportOptions } from './FeedbackContext';
import { BugReportDialog } from './BugReportDialog';
import { FeedbackDialog } from './FeedbackDialog';

type BugReportState = {
  open: boolean;
  diagnostics: Diagnostics | null;
  fromCrash: boolean;
};

// Owns the two dialogs so any component (Navbar's Help menu, the route
// ErrorBoundary) can open them. Each open bumps `session`, which is used as
// the dialog's `key` — a fresh form every time, without the close
// animation losing its content the way unmounting on close would.
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [session, setSession] = useState(0);
  const [bugReport, setBugReport] = useState<BugReportState>({
    open: false,
    diagnostics: null,
    fromCrash: false,
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRoute, setFeedbackRoute] = useState('');

  const openBugReport = useCallback(
    ({ crash }: BugReportOptions = {}) => {
      // Snapshot now, not at submit — this is the moment the user noticed
      // the problem; time spent typing in the dialog isn't evidence.
      const printer = queryClient.getQueryState(printerKeys.status());
      const diagnostics = buildDiagnostics({
        role: user?.role ?? null,
        crash,
        // Only present when the Navbar's indicator has been polling
        // (stockroom+ users on a PC that may have the bridge).
        printerStatus: printer && {
          status: printer.status,
          data: printer.data ?? null,
          error: printer.error?.message ?? null,
        },
      });
      setSession((s) => s + 1);
      setBugReport({ open: true, diagnostics, fromCrash: crash !== undefined });
    },
    [queryClient, user]
  );

  const openFeedback = useCallback(() => {
    setFeedbackRoute(window.location.pathname);
    setSession((s) => s + 1);
    setFeedbackOpen(true);
  }, []);

  const value = useMemo(() => ({ openBugReport, openFeedback }), [openBugReport, openFeedback]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <BugReportDialog
        key={`bug-${session}`}
        open={bugReport.open}
        onClose={() => setBugReport((prev) => ({ ...prev, open: false }))}
        diagnostics={bugReport.diagnostics}
        fromCrash={bugReport.fromCrash}
      />
      <FeedbackDialog
        key={`feedback-${session}`}
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        route={feedbackRoute}
      />
    </FeedbackContext.Provider>
  );
}

import { createContext, useContext } from 'react';

export interface BugReportOptions {
  // The crash being reported — set by App.tsx's ErrorBoundary so the
  // report carries the error and stack without the user describing it.
  crash?: unknown;
}

interface FeedbackContextType {
  openBugReport: (options?: BugReportOptions) => void;
  openFeedback: () => void;
}

export const FeedbackContext = createContext<FeedbackContextType | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within a FeedbackProvider');
  return ctx;
}

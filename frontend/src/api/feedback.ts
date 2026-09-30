// In-app bug reports and general feedback (backend apps/feedback). Both
// endpoints accept anonymous submissions (the login and SDS pages are
// public), so these work logged in or out.
import { apiFetch } from './client';
import type { BugReportCreate, BugReportInput, FeedbackCreate, FeedbackInput } from '../types';

export const createBugReport = (report: BugReportInput): Promise<BugReportCreate> => {
  return apiFetch('/api/feedback/reports/', {
    method: 'POST',
    body: JSON.stringify(report),
  });
};

export const createFeedback = (feedback: FeedbackInput): Promise<FeedbackCreate> => {
  return apiFetch('/api/feedback/general/', {
    method: 'POST',
    body: JSON.stringify(feedback),
  });
};

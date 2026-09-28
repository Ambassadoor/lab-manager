import { ApiError } from '../../api/client';

// Error text for a failed report/feedback submit, shown in the dialogs.
export function submitErrorMessage(error: Error): string {
  // DRF's throttle message ("Expected available in 2917 seconds") isn't
  // meant for people.
  if (error instanceof ApiError && error.status === 429) {
    return "You've sent several of these recently. Please wait a while and try again.";
  }
  return error.message;
}

// A one-shot cross-navigation result: some flows (e.g. submitting the "Add
// Container" form) fire an async side effect — printing a label, attaching
// an SDS — and then immediately navigate to a different page. A Snackbar
// owned by the page that fired the action would unmount (along with the
// rest of that page) before the async result ever comes back, so it can
// never actually be seen. sessionStorage survives the navigation (same
// mechanism ContainerForm already uses for its own form-memory cache); the
// destination page reads it once on mount and clears it immediately, so a
// later refresh or revisit doesn't show it again.
const STORAGE_KEY = 'pending_action_result';

// Field names match the local `SnackbarState` shape already used by
// Move.tsx/Transfer.tsx for their own (same-page, no navigation involved)
// success/error snackbars.
export type PendingActionResult = { message: string; severity: 'success' | 'error' };

export const setPendingActionResult = (result: PendingActionResult) => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
};

// Reads and immediately clears the stashed result — "take", not "get",
// since a second call (e.g. a remount) must come back empty.
export const takePendingActionResult = (): PendingActionResult | null => {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(STORAGE_KEY);
  try {
    return JSON.parse(raw) as PendingActionResult;
  } catch {
    return null;
  }
};

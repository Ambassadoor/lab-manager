import { useState } from 'react';
import { ApiError } from '../../api/client';

// A container write that changes its location can come back 409 instead of
// saving, if doing so would break a chemical storage compatibility rule
// (organics/inorganics, flammable/oxidizer, Nitric Acid isolation — see
// backend/apps/inventory/storage_rules.py) — advisory, not a hard block:
// resubmitting the identical request with confirm_storage_conflicts: true
// saves anyway. This hook is the shared "catch that 409, show the
// warnings, let the caller retry" plumbing every container-location call
// site (create, edit, bulk transfer) needs.
export function useStorageConflictConfirm() {
  const [state, setState] = useState<{ warnings: string[]; retry: () => void } | null>(null);

  // Checks whether `error` is that specific 409 shape; if so, stashes
  // `retry` for confirm() to call later and returns true so the caller
  // knows this error is being handled here instead of shown generically.
  const intercept = (error: unknown, retry: () => void): boolean => {
    if (!(error instanceof ApiError) || error.status !== 409) return false;
    const warnings = (error.body as { warnings?: unknown } | null)?.warnings;
    if (!Array.isArray(warnings) || warnings.length === 0) return false;
    setState({ warnings, retry });
    return true;
  };

  return {
    warnings: state?.warnings ?? null,
    isOpen: state !== null,
    confirm: () => {
      state?.retry();
      setState(null);
    },
    cancel: () => setState(null),
    intercept,
  };
}

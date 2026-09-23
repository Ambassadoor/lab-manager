import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import { ApiError } from '../../api/client';

// Routes a failed submit's error into a react-hook-form form: each of DRF's
// per-field errors whose field is in the form (e.g. "username already taken")
// is set on that input. Returns the message for anything that couldn't be
// placed on a field — for the form's own alert — or null if every error
// landed on a field.
export function applyApiErrors<TFieldValues extends FieldValues>(
  err: unknown,
  values: TFieldValues,
  setError: UseFormSetError<TFieldValues>
): string | null {
  if (err instanceof ApiError && err.fieldErrors) {
    const leftover: string[] = [];
    let placedAny = false;
    for (const [field, message] of Object.entries(err.fieldErrors)) {
      if (field in values) {
        setError(field as FieldPath<TFieldValues>, { message });
        placedAny = true;
      } else {
        leftover.push(message);
      }
    }
    if (leftover.length > 0) return leftover.join(' ');
    return placedAny ? null : err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

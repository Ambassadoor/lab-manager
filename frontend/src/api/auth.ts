import { apiFetch, ApiError } from './client';
import { type PreValidation, type User, type UserRegistration } from '../types';

// Call once on app load so Django sets the csrftoken cookie.
export const initCsrf = () => apiFetch<void>('/api/auth/csrf/');

export const login = (username: string, password: string) =>
  apiFetch<User>('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const logout = () => apiFetch<void>('/api/auth/logout/', { method: 'POST' });

export const getMe = () => apiFetch<User>('/api/auth/me/');

function isPreValidationErrors(body: unknown): body is PreValidation {
  return !!body && typeof body === 'object' && 'errors' in body;
}

// ValidateView returns 204 when the field's available, or 422 with
// {"errors": {field: message}} when it's taken/invalid. That "errors"
// wrapper is specific to this endpoint, so it's read straight off the
// thrown ApiError's raw body rather than through ApiError's generic
// per-field flattening (which only understands an unwrapped {field: [...]}
// body or DRF's {"detail": ...} convention, neither of which matches this).
export const preValidate = async (
  field: string,
  value: string
): Promise<PreValidation | undefined> => {
  try {
    await apiFetch<void>(`/api/auth/validate/?${field}=${value}`);
    return undefined;
  } catch (err) {
    if (err instanceof ApiError && err.status === 422 && isPreValidationErrors(err.body)) {
      return err.body;
    }
    throw err;
  }
};

export const register = (user: UserRegistration) =>
  apiFetch<User>(`/api/auth/register/`, {
    method: 'POST',
    body: JSON.stringify(user),
  });

import { apiFetch } from './client';
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

export const preValidate = (field: string, value: string) => apiFetch<PreValidation | void>(`/api/auth/validate/?${field}=${value}`)

export const register = (user: UserRegistration) => apiFetch<User | void>(`/api/auth/register/`, {
  method: 'POST',
  body: JSON.stringify(user)
})

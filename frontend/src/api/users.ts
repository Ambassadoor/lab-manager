// Admin/Lab Manager viewing and editing *other* users' accounts — see
// api/auth.ts for the self-service equivalent (getMe/updateMe).
import { apiFetch, toQueryString } from './client';
import type { Role, User } from '../types';

export type UserListParams = {
  search?: string;
  role?: Role;
  ordering?: string;
};

export const getUsers = (params?: UserListParams): Promise<User[]> => {
  return apiFetch(`/api/auth/users/${toQueryString(params)}`);
};

export const getUserById = (id: string): Promise<User> => {
  return apiFetch(`/api/auth/users/${id}/`);
};

export type UserUpdate = Partial<Omit<User, 'id' | 'role_display'>>;

export const updateUser = (id: string, data: UserUpdate): Promise<User> => {
  return apiFetch(`/api/auth/users/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

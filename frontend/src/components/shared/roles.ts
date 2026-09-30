import type { Role, User } from '../../types';

// Mirrors backend/apps/users/permissions.py's ROLE_RANK by hand — no shared
// source of truth across the language boundary (same tradeoff already
// accepted for the `Role` type itself). Keep in sync if the backend's table
// changes.
const ROLE_RANK: Record<Role, number> = {
  admin: 4,
  lab_manager: 4,
  coordinator: 3,
  faculty: 3,
  stockroom: 2,
  lab_assistant: 1,
};

export const hasRoleAtLeast = (user: User | null, role: Role): boolean =>
  !!user && ROLE_RANK[user.role] >= ROLE_RANK[role];

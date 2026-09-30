import type { Role, User } from '../../types';

// Form values for Profile (self-edit) and UserEditForm (admin edit). `role`
// is only used by UserEditForm — Profile never sets it, so it's never sent
// (the backend keeps role read-only on /me anyway).
export type UserFormValues = {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  lipscomb_id: string;
  role?: Role;
};

// The editable account fields as form defaults (lipscomb_id: null -> '').
// Kept out of UserFields.tsx so that file only exports components (Vite
// fast refresh).
export const userFormDefaults = (user: User): UserFormValues => ({
  first_name: user.first_name,
  last_name: user.last_name,
  email: user.email,
  username: user.username,
  lipscomb_id: user.lipscomb_id ?? '',
});

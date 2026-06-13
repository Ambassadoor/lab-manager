// Shared application types.

export type Role = 'lab_manager' | 'stockroom' | 'viewer';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
}

export interface UserRegistration extends Omit<User, 'id' | 'role'> {
  password: string,
  lipscomb_id: string
}

export interface PreValidation {
  errors: {
    username?: string,
    email?: string,
  }
}
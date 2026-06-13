import { createContext, useContext } from 'react';
import type { PreValidation, User, UserRegistration } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  preValidate: (field: string, value: string) => Promise<PreValidation | undefined>
  register: (user: UserRegistration) => Promise<User | undefined>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

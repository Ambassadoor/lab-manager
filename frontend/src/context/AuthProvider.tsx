import { useEffect, useState, type ReactNode } from 'react';
import {
  getMe,
  initCsrf,
  login as apiLogin,
  logout as apiLogout,
  preValidate as apiPreValidate,
  register as apiRegister,
} from '../api/auth';
import type { User, UserRegistration } from '../types';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  //Set CSRF header, verify and set user
  useEffect(() => {
    initCsrf()
      .then(() => getMe())
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    setUser(await apiLogin(username, password));
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  //TODO: Maybe make these memoized using useCallback
  const preValidate = async (field: string, value: string) => {
    const response = await apiPreValidate(field, value);
    if (response) {
      return response;
    }
  };

  const register = async (user: UserRegistration) => {
    const response = await apiRegister(user);
    if (response) {
      return response;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, preValidate, register }}>
      {children}
    </AuthContext.Provider>
  );
}

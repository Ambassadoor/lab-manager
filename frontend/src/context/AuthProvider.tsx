import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getMe,
  initCsrf,
  login as apiLogin,
  logout as apiLogout,
  preValidate as apiPreValidate,
  register as apiRegister,
  updateMe as apiUpdateMe,
  type ProfileUpdate,
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

  const login = useCallback(async (username: string, password: string) => {
    setUser(await apiLogin(username, password));
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const preValidate = useCallback(
    (field: string, value: string) => apiPreValidate(field, value),
    []
  );

  const register = useCallback((user: UserRegistration) => apiRegister(user), []);

  const updateProfile = useCallback(async (data: ProfileUpdate) => {
    const updated = await apiUpdateMe(data);
    setUser(updated);
    return updated;
  }, []);

  // Memoized so consumers only re-render when one of these actually changes,
  // rather than on every AuthProvider render (a new object literal here would
  // defeat the useCallback references above).
  const value = useMemo(
    () => ({ user, loading, login, logout, preValidate, register, updateProfile }),
    [user, loading, login, logout, preValidate, register, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

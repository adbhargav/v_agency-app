import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { http, tokenStore, UNAUTHORIZED_EVENT } from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!tokenStore.get());

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    qc.clear();
  }, [qc]);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return;
    const { user } = await http.get<{ user: User }>('/auth/me');
    setUser(user);
  }, []);

  useEffect(() => {
    if (!tokenStore.get()) return;
    refresh()
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [refresh, logout]);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await http.post<{ token: string; user: User }>('/auth/login', { email, password });
      tokenStore.set(res.token);
      qc.clear();
      setUser(res.user);
      return res.user;
    },
    [qc],
  );

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For components that only render when logged in. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('No authenticated user');
  return user;
}

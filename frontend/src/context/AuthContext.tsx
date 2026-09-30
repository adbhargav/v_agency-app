import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, http, tokenStore, UNAUTHORIZED_EVENT } from '../api/client';
import { clearPersistedQueries } from '../lib/queryPersist';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// The last known user is kept so the app can render immediately on reload while /auth/me
// re-validates in the background, instead of showing a spinner until the server answers.
const USER_KEY = 'vagency.user';
const userCache = {
  get(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw && tokenStore.get() ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  set(user: User | null) {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUserState] = useState<User | null>(() => userCache.get());
  // Only block rendering when there is a token but no cached user to show yet.
  const [loading, setLoading] = useState(() => !!tokenStore.get() && !userCache.get());

  const setUser = useCallback((u: User | null) => {
    userCache.set(u);
    setUserState(u);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    qc.clear();
    clearPersistedQueries();
  }, [qc, setUser]);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return;
    const { user } = await http.get<{ user: User }>('/auth/me');
    setUser(user);
  }, [setUser]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    refresh()
      // Only a rejected session logs out; a slow or waking server must not.
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) logout();
      })
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
      clearPersistedQueries();
      setUser(res.user);
      return res.user;
    },
    [qc, setUser],
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

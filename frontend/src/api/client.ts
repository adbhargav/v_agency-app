import type { ErrorCode } from '../types';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';
const TOKEN_KEY = 'vagency.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  status: number;
  code: ErrorCode | string;
  details?: unknown;
  constructor(status: number, message: string, code: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Fired when the API responds 401 so the auth context can log the user out. */
export const UNAUTHORIZED_EVENT = 'vagency:unauthorized';

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) params.set(k, v.join(','));
    } else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Network error — check your connection.', 'NETWORK');
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && path !== '/auth/login') {
      tokenStore.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(
      res.status,
      err?.message || res.statusText || 'Request failed',
      err?.code || 'INTERNAL',
      err?.details,
    );
  }
  return data as T;
}

export const http = {
  get: <T>(path: string, query?: Query) => api<T>(path, { query }),
  post: <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'NOT_CONFIGURED')
      return 'Google Drive is not connected yet. Ask an administrator to configure Drive credentials.';
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export function isNotConfigured(e: unknown) {
  return e instanceof ApiError && (e.status === 503 || e.code === 'NOT_CONFIGURED');
}

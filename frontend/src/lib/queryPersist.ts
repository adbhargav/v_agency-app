import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/**
 * Saves the React Query cache in localStorage so reopening the app shows the last data instantly
 * while fresh data loads in the background. Cleared on login and logout so users never see each
 * other's data.
 */
const KEY = 'vagency.cache';

export const queryPersister = createSyncStoragePersister({
  key: KEY,
  storage: typeof window === 'undefined' ? undefined : safeStorage(),
  throttleTime: 1000,
});

// File links inside cached data expire after 12h, so older caches are dropped.
export const PERSIST_MAX_AGE = 12 * 60 * 60 * 1000;

export function clearPersistedQueries() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function safeStorage(): Storage | undefined {
  try {
    const probe = '__vagency_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return undefined; // private mode / blocked storage: just don't persist
  }
}

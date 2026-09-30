import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { PERSIST_MAX_AGE, queryPersister } from './lib/queryPersist';
import { ApiError } from './api/client';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Kept as long as the persisted cache so reopened tabs render from it instantly.
      gcTime: PERSIST_MAX_AGE,
      refetchOnWindowFocus: true,
      retry: (count, error) => {
        // The API client already waits out a waking server (0 / 502 / 504), and 4xx won't change on retry.
        if (error instanceof ApiError && (error.status === 0 || error.status === 502 || error.status === 504)) return false;
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return count < 1;
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE }}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);

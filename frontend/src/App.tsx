import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { homeFor } from './lib/roles';
import type { Role } from './types';

// Role areas are code-split so each user only downloads what they can use.
const AdminRoutes = lazy(() => import('./pages/admin/AdminRoutes'));
const EmployeeRoutes = lazy(() => import('./pages/employee/EmployeeRoutes'));
const ClientRoutes = lazy(() => import('./pages/client/ClientRoutes'));
const LoginPage = lazy(() => import('./pages/shared/LoginPage'));
const NotificationsPage = lazy(() => import('./pages/shared/NotificationsPage'));
const SettingsPage = lazy(() => import('./pages/shared/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/shared/NotFoundPage'));


function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-xl font-bold text-white shadow-lift">V</span>
        <Spinner />
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/admin/*" element={<RoleGate role="admin"><AdminRoutes /></RoleGate>} />
          <Route path="/app/*" element={<RoleGate role="employee"><EmployeeRoutes /></RoleGate>} />
          <Route path="/client/*" element={<RoleGate role="client"><ClientRoutes /></RoleGate>} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

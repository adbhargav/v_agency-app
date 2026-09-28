import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useUser } from '../../context/AuthContext';
import { ProjectDetailPage, ProjectsListPage } from '../shared/Projects';

const EmployeeBoard = lazy(() => import('./EmployeeBoard'));
const EodPage = lazy(() => import('./EodPage'));
const WalletPage = lazy(() => import('./WalletPage'));
const BriefsPage = lazy(() => import('./BriefsPage'));
const NotFoundPage = lazy(() => import('../shared/NotFoundPage'));

export default function EmployeeRoutes() {
  const user = useUser();
  return (
    <Routes>
      <Route index element={<EmployeeBoard />} />
      <Route path="projects" element={<ProjectsListPage />} />
      <Route path="projects/:id" element={<ProjectDetailPage />} />
      <Route path="eod" element={<EodPage />} />
      <Route path="briefs" element={<BriefsPage />} />
      <Route path="wallet" element={user.employmentType === 'project_based' ? <WalletPage /> : <Navigate to="/app" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

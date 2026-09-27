import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ProjectDetailPage } from '../shared/Projects';

const ClientOverview = lazy(() => import('./ClientOverview'));
const ActionRequiredPage = lazy(() => import('./ActionRequiredPage'));
const ClientTasksPage = lazy(() => import('./ClientTasksPage'));
const ApprovedAssetsPage = lazy(() => import('./ApprovedAssetsPage'));
const NotFoundPage = lazy(() => import('../shared/NotFoundPage'));

export default function ClientRoutes() {
  return (
    <Routes>
      <Route index element={<ClientOverview />} />
      <Route path="actions" element={<ActionRequiredPage />} />
      <Route path="tasks" element={<ClientTasksPage />} />
      <Route path="assets" element={<ApprovedAssetsPage />} />
      <Route path="projects/:id" element={<ProjectDetailPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

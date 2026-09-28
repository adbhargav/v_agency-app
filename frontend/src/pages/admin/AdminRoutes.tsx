import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ProjectDetailPage, ProjectsListPage } from '../shared/Projects';

const AdminDashboard = lazy(() => import('./AdminDashboard'));
const MasterTasksPage = lazy(() => import('./MasterTasksPage'));
const TeamPage = lazy(() => import('./TeamPage'));
const ClientsPage = lazy(() => import('./ClientsPage'));
const FinancePage = lazy(() => import('./FinancePage'));
const TeamEodPage = lazy(() => import('./TeamEodPage'));
const MasterStatusesPage = lazy(() => import('./MasterStatusesPage'));
const ServicesPage = lazy(() => import('./ServicesPage'));
const RequirementsPage = lazy(() => import('./RequirementsPage'));
const NotFoundPage = lazy(() => import('../shared/NotFoundPage'));

export default function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<AdminDashboard />} />
      <Route path="tasks" element={<MasterTasksPage />} />
      <Route path="projects" element={<ProjectsListPage />} />
      <Route path="projects/:id" element={<ProjectDetailPage />} />
      <Route path="team" element={<TeamPage />} />
      <Route path="clients" element={<ClientsPage />} />
      <Route path="finance" element={<FinancePage />} />
      <Route path="eod" element={<TeamEodPage />} />
      <Route path="statuses" element={<MasterStatusesPage />} />
      <Route path="services" element={<ServicesPage />} />
      <Route path="requirements" element={<RequirementsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

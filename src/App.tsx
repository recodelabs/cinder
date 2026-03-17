// ABOUTME: Root application component with auth gating and route definitions.
// ABOUTME: Orchestrates sign-in and org/project-scoped FHIR browser routes.
import { Center, Loader } from '@mantine/core';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppProviders, FhirProvider } from './AppProviders';
import { useAuth } from './auth/AuthProvider';
import { useOrg } from './contexts/OrgContext';
import { Shell } from './Shell';
import { HomePage } from './pages/HomePage';
import { ResourceTypePage } from './pages/ResourceTypePage';
import { ResourceDetailPage } from './pages/ResourceDetailPage';
import { ResourceCreateRoutePage } from './pages/ResourceCreateRoutePage';
import { BulkLoadPage } from './pages/BulkLoadPage';
import { DeletePatientResourcesPage } from './pages/DeletePatientResourcesPage';
import { SignInPage } from './pages/SignInPage';
import { CreateOrgPage } from './pages/CreateOrgPage';
import { OrgSettingsPage } from './pages/OrgSettingsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { loadSchemas } from './schemas';

function OrgRedirect(): JSX.Element {
  const { activeOrgSlug, activeProject } = useOrg();
  if (activeOrgSlug && activeProject) {
    return <Navigate to={`/orgs/${activeOrgSlug}/projects/${activeProject.slug}`} />;
  }
  if (activeOrgSlug) {
    return <Navigate to={`/orgs/${activeOrgSlug}/projects`} />;
  }
  return <Navigate to="/orgs/new" />;
}

function AppContent(): JSX.Element {
  const { session } = useAuth();
  const [schemasReady, setSchemasReady] = useState(false);

  useEffect(() => {
    loadSchemas().then(() => setSchemasReady(true));
  }, []);

  if (session.isPending) {
    return <Center h="100vh"><Loader size="lg" /></Center>;
  }

  if (!session.data?.user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="*" element={<Navigate to="/sign-in" />} />
      </Routes>
    );
  }

  if (!schemasReady) {
    return <Center h="100vh"><Loader size="lg" /></Center>;
  }

  return (
    <Routes>
      <Route path="/sign-in" element={<Navigate to="/" />} />
      <Route path="/orgs/new" element={<CreateOrgPage />} />
      <Route path="/orgs/:orgSlug/settings" element={<OrgSettingsPage />} />
      <Route path="/orgs/:orgSlug/projects" element={<ProjectsPage />} />
      <Route path="/orgs/:orgSlug/projects/new" element={<CreateProjectPage />} />
      <Route element={<FhirProvider><Shell /></FhirProvider>}>
        <Route path="/orgs/:orgSlug/projects/:projectSlug" element={<HomePage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/:resourceType" element={<ResourceTypePage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/:resourceType/new" element={<ResourceCreateRoutePage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/:resourceType/:id" element={<ResourceDetailPage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/:resourceType/:id/:tab" element={<ResourceDetailPage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/bulk-load" element={<BulkLoadPage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/delete-patient-resources" element={<DeletePatientResourcesPage />} />
      </Route>
      <Route path="/" element={<OrgRedirect />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export function App(): JSX.Element {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}

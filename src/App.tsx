// ABOUTME: Root application component with auth gating and route definitions.
// ABOUTME: Orchestrates sign-in and org/project-scoped FHIR browser routes.
import { Center, Loader } from '@mantine/core';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppProviders, FhirProvider } from './AppProviders';
import { useAuth } from './auth/AuthProvider';

import { Shell } from './Shell';
import { OrgShell } from './OrgShell';
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
import { CapturePage } from './pages/CapturePage';
import { CaptureFillPage } from './pages/CaptureFillPage';
import { loadSchemas } from './schemas';

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
      <Route element={<OrgShell />}>
        <Route path="/orgs/new" element={<CreateOrgPage />} />
        <Route path="/orgs/:orgSlug/settings" element={<OrgSettingsPage />} />
        <Route path="/orgs/:orgSlug/projects" element={<ProjectsPage />} />
        <Route path="/orgs/:orgSlug/projects/new" element={<CreateProjectPage />} />
      </Route>
      <Route element={<FhirProvider><Shell /></FhirProvider>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/:resourceType" element={<ResourceTypePage />} />
        <Route path="/:resourceType/new" element={<ResourceCreateRoutePage />} />
        <Route path="/:resourceType/:id" element={<ResourceDetailPage />} />
        <Route path="/:resourceType/:id/:tab" element={<ResourceDetailPage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/capture/:id" element={<CaptureFillPage />} />
        <Route path="/bulk-load" element={<BulkLoadPage />} />
        <Route path="/delete-patient-resources" element={<DeletePatientResourcesPage />} />
      </Route>
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

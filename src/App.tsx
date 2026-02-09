// ABOUTME: Root application component with route definitions.
// ABOUTME: Sets up providers and maps URL paths to page components.
import type { JSX } from 'react';
import { Route, Routes } from 'react-router';
import { AppProviders } from './AppProviders';
import { Shell } from './Shell';
import { HomePage } from './pages/HomePage';
import { ResourceTypePage } from './pages/ResourceTypePage';
import { ResourceDetailPage } from './pages/ResourceDetailPage';

export function App(): JSX.Element {
  return (
    <AppProviders>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path=":resourceType" element={<ResourceTypePage />} />
          <Route path=":resourceType/:id" element={<ResourceDetailPage />} />
        </Route>
      </Routes>
    </AppProviders>
  );
}

// ABOUTME: Root application component with auth gating and route definitions.
// ABOUTME: Orchestrates sign-in, store selection, and the main FHIR browser.
import { Center, Loader } from '@mantine/core';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';
import { AppProviders, FhirProvider } from './AppProviders';
import { useAuth } from './auth/AuthProvider';
import type { StoreConfig } from './config/StoreConfig';
import { loadStoreConfig, saveStoreConfig } from './config/StoreConfig';
import { StoreSelector } from './config/StoreSelector';
import { Shell } from './Shell';
import { HomePage } from './pages/HomePage';
import { ResourceTypePage } from './pages/ResourceTypePage';
import { ResourceDetailPage } from './pages/ResourceDetailPage';
import { ResourceCreateRoutePage } from './pages/ResourceCreateRoutePage';
import { SignInPage } from './pages/SignInPage';
import { loadSchemas } from './schemas';

const isDevProxy = !import.meta.env.VITE_GOOGLE_CLIENT_ID;

function AppContent(): JSX.Element {
  const { isAuthenticated } = useAuth();
  const [storeConfig, setStoreConfig] = useState<StoreConfig | undefined>(loadStoreConfig);
  const [schemasReady, setSchemasReady] = useState(false);

  useEffect(() => {
    loadSchemas().then(() => setSchemasReady(true));
  }, []);

  const handleStoreSubmit = useCallback((config: StoreConfig) => {
    saveStoreConfig(config);
    setStoreConfig(config);
  }, []);

  const handleChangeStore = useCallback(() => {
    setStoreConfig(undefined);
  }, []);

  if (!isDevProxy && !isAuthenticated) {
    return <SignInPage />;
  }

  if (!isDevProxy && !storeConfig) {
    return <StoreSelector onSubmit={handleStoreSubmit} />;
  }

  if (!schemasReady) {
    return <Center h="100vh"><Loader size="lg" /></Center>;
  }

  return (
    <FhirProvider storeConfig={storeConfig}>
      <Routes>
        <Route element={<Shell onChangeStore={isDevProxy ? undefined : handleChangeStore} />}>
          <Route index element={<HomePage />} />
          <Route path=":resourceType" element={<ResourceTypePage />} />
          <Route path=":resourceType/new" element={<ResourceCreateRoutePage />} />
          <Route path=":resourceType/:id" element={<ResourceDetailPage />} />
          <Route path=":resourceType/:id/:tab" element={<ResourceDetailPage />} />
        </Route>
      </Routes>
    </FhirProvider>
  );
}

export function App(): JSX.Element {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}

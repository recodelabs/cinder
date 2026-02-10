// ABOUTME: Composes application context providers and FHIR client setup.
// ABOUTME: AppProviders wraps auth/router/theme; FhirProvider creates the MedplumClient.
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/spotlight/styles.css';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
import { BrowserRouter, useNavigate } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import type { StoreConfig } from './config/StoreConfig';
import { storeBaseUrl } from './config/StoreConfig';
import { HealthcareMedplumClient } from './fhir/medplum-adapter';
import { loadSchemas } from './schemas';

loadSchemas();

interface FhirProviderProps {
  readonly storeConfig?: StoreConfig;
  readonly children: ReactNode;
}

export function FhirProvider({ storeConfig, children }: FhirProviderProps): JSX.Element {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const medplum = useMemo(() => {
    return new HealthcareMedplumClient({
      getAccessToken: () => accessToken,
      storeBaseUrl: storeConfig ? storeBaseUrl(storeConfig) : undefined,
    });
  }, [accessToken, storeConfig]);

  return (
    <MedplumProvider medplum={medplum} navigate={navigate}>
      {children}
    </MedplumProvider>
  );
}

interface AppProvidersProps {
  readonly children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps): JSX.Element {
  return (
    <MantineProvider>
      <AuthProvider>
        <BrowserRouter>
          {children}
        </BrowserRouter>
      </AuthProvider>
    </MantineProvider>
  );
}

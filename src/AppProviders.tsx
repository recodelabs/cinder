// ABOUTME: Composes all application context providers.
// ABOUTME: Wires auth, MedplumClient subclass, and Medplum context together.
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
import { BrowserRouter, useNavigate } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { HealthcareMedplumClient } from './fhir/medplum-adapter';
import { loadSchemas } from './schemas';

loadSchemas();

interface FhirProviderProps {
  readonly children: ReactNode;
}

function FhirProvider({ children }: FhirProviderProps): JSX.Element {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const medplum = useMemo(() => {
    return new HealthcareMedplumClient({
      getAccessToken: () => accessToken,
    });
  }, [accessToken]);

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
          <FhirProvider>{children}</FhirProvider>
        </BrowserRouter>
      </AuthProvider>
    </MantineProvider>
  );
}

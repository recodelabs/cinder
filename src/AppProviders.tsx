// ABOUTME: Composes application context providers and FHIR client setup.
// ABOUTME: AppProviders wraps auth/router/theme; FhirProvider creates the MedplumClient.
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/spotlight/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
import { BrowserRouter, useNavigate } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { OrgProvider, useOrg } from './contexts/OrgContext';
import { HealthcareMedplumClient } from './fhir/medplum-adapter';

export function FhirProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const { signOut } = useAuth();
  const { activeProject } = useOrg();
  const navigate = useNavigate();

  const { activeOrgSlug } = useOrg();

  const medplum = useMemo(() => {
    return new HealthcareMedplumClient({
      projectId: activeProject?.id,
      onUnauthenticated: signOut,
      onNoProject: () => {
        const dest = activeOrgSlug ? `/orgs/${activeOrgSlug}/projects` : '/orgs/new';
        navigate(dest);
      },
    });
  }, [activeProject?.id, activeOrgSlug, signOut, navigate]);

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
      <Notifications position="top-right" />
      <AuthProvider>
        <BrowserRouter>
          <OrgProvider>
            {children}
          </OrgProvider>
        </BrowserRouter>
      </AuthProvider>
    </MantineProvider>
  );
}

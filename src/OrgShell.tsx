// ABOUTME: Lightweight app shell for org/project management pages (no FHIR required).
// ABOUTME: Provides the header with branding, OrgSwitcher, ProjectSwitcher, and SignOut.
import { AppShell, Anchor, Button, Group, Title } from '@mantine/core';
import type { JSX } from 'react';
import { Link, Outlet } from 'react-router';
import { useAuth } from './auth/AuthProvider';
import { CinderLogo } from './CinderLogo';
import { OrgSwitcher } from './components/OrgSwitcher';
import { ProjectSwitcher } from './components/ProjectSwitcher';

export function OrgShell(): JSX.Element {
  const { signOut } = useAuth();

  return (
    <AppShell header={{ height: 50 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md">
          <Anchor component={Link} to="/" underline="never" c="inherit">
            <Group gap={8} wrap="nowrap">
              <CinderLogo />
              <Title order={3}>Cinder</Title>
            </Group>
          </Anchor>
          <OrgSwitcher />
          <ProjectSwitcher />
          <Group gap="xs" ml="auto">
            <Button variant="subtle" size="compact-sm" onClick={signOut}>Sign Out</Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

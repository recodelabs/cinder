// ABOUTME: Application shell with sidebar navigation and route outlet.
// ABOUTME: Provides the main layout: header, resource type sidebar, content area.
import { AppShell, Group, NavLink, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { Link, Outlet } from 'react-router';

const RESOURCE_TYPES = [
  'Patient', 'Practitioner', 'Organization', 'Encounter',
  'Observation', 'Condition', 'Procedure', 'MedicationRequest',
  'AllergyIntolerance', 'Immunization', 'DiagnosticReport',
  'CarePlan', 'CareTeam', 'Claim', 'Coverage',
  'DocumentReference', 'Goal', 'Location', 'Medication',
  'ServiceRequest', 'Specimen',
];

export function Shell(): JSX.Element {
  return (
    <AppShell
      header={{ height: 50 }}
      navbar={{ width: 220, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Title order={3}>Cinder</Title>
          <Text size="sm" c="dimmed">FHIR Browser</Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {RESOURCE_TYPES.map((type) => (
          <NavLink key={type} component={Link} to={`/${type}`} label={type} />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

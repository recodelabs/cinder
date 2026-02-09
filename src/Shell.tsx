// ABOUTME: Application shell with sidebar navigation, header search, and route outlet.
// ABOUTME: Provides the main layout: header with search, resource type sidebar, content area.
import { AppShell, Group, NavLink, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import type { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { Spotlight, spotlight } from '@mantine/spotlight';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';

const RESOURCE_TYPES = [
  'Patient', 'Practitioner', 'Organization', 'Encounter',
  'Observation', 'Condition', 'Procedure', 'MedicationRequest',
  'AllergyIntolerance', 'Immunization', 'DiagnosticReport',
  'CarePlan', 'CareTeam', 'Claim', 'Coverage',
  'DocumentReference', 'Goal', 'Location', 'Medication',
  'ServiceRequest', 'Specimen',
];

export function Shell(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = useDebouncedCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const bundle: Bundle = await medplum.search('Patient' as ResourceType, { name: q, _count: '10' });
      setResults((bundle.entry ?? []).map((e) => e.resource).filter(Boolean) as Resource[]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, 300);

  const handleQueryChange = (q: string): void => {
    setQuery(q);
    handleSearch(q);
  };

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
          <TextInput
            placeholder="Search..."
            leftSection={<IconSearch size={16} />}
            ml="xl"
            style={{ flex: 1, maxWidth: 400 }}
            onClick={() => spotlight.open()}
            readOnly
          />
        </Group>
      </AppShell.Header>

      <Spotlight.Root query={query} onQueryChange={handleQueryChange}>
        <Spotlight.Search placeholder="Search patients..." leftSection={<IconSearch size={20} />} loading={loading} />
        <Spotlight.ActionsList>
          {results.length > 0 ? (
            results.map((r) => (
              <Spotlight.Action
                key={r.id}
                label={getDisplayString(r)}
                description={`${r.resourceType}/${r.id}`}
                onClick={() => navigate(`/${r.resourceType}/${r.id}`)}
              />
            ))
          ) : query.trim() ? (
            <Spotlight.Empty>No results found</Spotlight.Empty>
          ) : (
            <Spotlight.Empty>Start typing to search...</Spotlight.Empty>
          )}
        </Spotlight.ActionsList>
      </Spotlight.Root>

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

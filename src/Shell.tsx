// ABOUTME: Application shell with sidebar navigation, header search, and route outlet.
// ABOUTME: Provides the main layout: header with search, filterable sidebar, content area.
import { AppShell, Group, NavLink, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import type { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { Spotlight, spotlight } from '@mantine/spotlight';
import { IconFilter, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { RESOURCE_TYPES } from './constants';

export function Shell(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState('');

  const activeResourceType = location.pathname.split('/')[1] || '';

  const filteredTypes = useMemo(
    () =>
      sidebarFilter
        ? RESOURCE_TYPES.filter((t) => t.toLowerCase().includes(sidebarFilter.toLowerCase()))
        : RESOURCE_TYPES,
    [sidebarFilter]
  );

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
                onClick={() => navigate(`/${r.resourceType}/${r.id}`)}
              >
                <Stack gap={0}>
                  <Text size="sm" fw={500}>{getDisplayString(r)}</Text>
                  <Text size="xs" c="dimmed">{r.resourceType}/{r.id}</Text>
                </Stack>
              </Spotlight.Action>
            ))
          ) : query.trim() ? (
            <Spotlight.Empty>No results found</Spotlight.Empty>
          ) : (
            <Spotlight.Empty>Start typing to search...</Spotlight.Empty>
          )}
        </Spotlight.ActionsList>
      </Spotlight.Root>

      <AppShell.Navbar p="xs">
        <TextInput
          placeholder="Filter..."
          leftSection={<IconFilter size={14} />}
          size="xs"
          mb="xs"
          value={sidebarFilter}
          onChange={(e) => setSidebarFilter(e.currentTarget.value)}
        />
        {filteredTypes.map((type) => (
          <NavLink
            key={type}
            component={Link}
            to={`/${type}`}
            label={type}
            active={activeResourceType === type}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

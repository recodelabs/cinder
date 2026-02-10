// ABOUTME: Application shell with sidebar navigation, header search, and route outlet.
// ABOUTME: Provides the main layout: header with search, filterable sidebar, content area.
import { Anchor, AppShell, Button, Group, Kbd, NavLink, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import type { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { Spotlight, spotlight } from '@mantine/spotlight';
import { IconFilter, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from './auth/AuthProvider';
import { RESOURCE_TYPES } from './constants';

interface ShellProps {
  readonly onChangeStore?: () => void;
}

export function Shell({ onChangeStore }: ShellProps = {}): JSX.Element {
  const { signOut } = useAuth();
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Resource[]>([]);
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
    try {
      const searches = (['Patient', 'Practitioner', 'Organization'] as ResourceType[]).map((type) =>
        medplum.search(type, { name: q, _count: '5' }).catch(() => ({ resourceType: 'Bundle', type: 'searchset', entry: [] }) as Bundle)
      );
      const bundles = await Promise.all(searches);
      const resources = bundles.flatMap((b) => (b.entry ?? []).map((e) => e.resource).filter(Boolean)) as Resource[];
      setResults(resources);
    } catch {
      setResults([]);
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
          <Anchor component={Link} to="/" underline="never" c="inherit"><Title order={3}>Cinder</Title></Anchor>
          <Text size="sm" c="dimmed">FHIR Browser</Text>
          <TextInput
            placeholder="Search..."
            leftSection={<IconSearch size={16} />}
            rightSection={<Kbd size="xs">⌘K</Kbd>}
            ml="xl"
            style={{ flex: 1, maxWidth: 400 }}
            onClick={() => spotlight.open()}
            readOnly
          />
          {onChangeStore && (
            <Group gap="xs" ml="auto">
              <Button variant="subtle" size="compact-sm" onClick={onChangeStore}>Change Store</Button>
              <Button variant="subtle" size="compact-sm" onClick={signOut}>Sign Out</Button>
            </Group>
          )}
        </Group>
      </AppShell.Header>

      <Spotlight.Root query={query} onQueryChange={handleQueryChange} shortcut={['mod + K']}>
        <Spotlight.Search placeholder="Search resources..." leftSection={<IconSearch size={20} />} />
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

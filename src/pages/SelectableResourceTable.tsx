// ABOUTME: Table component for bulk delete mode that displays resources with checkboxes.
// ABOUTME: Fetches resources using the same URL-driven search params and supports select-all.
import { formatSearchQuery, getDisplayString } from '@medplum/core';
import type { SearchRequest } from '@medplum/core';
import type { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { Checkbox, Group, Loader, Pagination, Stack, Table, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

interface SelectableResourceTableProps {
  readonly search: SearchRequest;
  readonly selectedIds: Set<string>;
  readonly onSelectionChange: (ids: Set<string>) => void;
}

interface PageState {
  readonly resources: Resource[];
  readonly total: number;
  readonly loading: boolean;
  readonly error?: string;
}

function getFieldValue(resource: Resource, field: string): string {
  if (field === '_id') return resource.id ?? '';
  if (field === '_lastUpdated') return resource.meta?.lastUpdated ?? '';
  if (field in resource) {
    const val = (resource as unknown as Record<string, unknown>)[field];
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return getDisplayString(val as Resource);
    return String(val);
  }
  return '';
}

export function SelectableResourceTable({
  search,
  selectedIds,
  onSelectionChange,
}: SelectableResourceTableProps): JSX.Element {
  const medplum = useMedplum();
  const [page, setPage] = useState(1);
  const [state, setState] = useState<PageState>({
    resources: [],
    total: 0,
    loading: true,
  });

  const count = search.count ?? 20;
  const fields = search.fields ?? ['_id', '_lastUpdated'];

  const fetchPage = useCallback(
    async (pageNum: number) => {
      setState((prev) => ({ ...prev, loading: true, error: undefined }));
      try {
        const offset = (pageNum - 1) * count;
        const searchQuery = formatSearchQuery({
          ...search,
          offset,
          count,
        });
        const bundle: Bundle = await medplum.search(
          search.resourceType as ResourceType,
          new URLSearchParams(searchQuery.replace('?', ''))
        );
        const resources: Resource[] = [];
        for (const entry of bundle.entry ?? []) {
          if (entry.resource) {
            resources.push(entry.resource);
          }
        }
        setState({
          resources,
          total: bundle.total ?? resources.length,
          loading: false,
        });
      } catch (err: unknown) {
        setState({
          resources: [],
          total: 0,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [medplum, search, count]
  );

  useEffect(() => {
    setPage(1);
    void fetchPage(1);
  }, [fetchPage]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      void fetchPage(newPage);
    },
    [fetchPage]
  );

  const pageResourceIds = state.resources
    .map((r) => r.id)
    .filter((id): id is string => !!id);

  const allOnPageSelected =
    pageResourceIds.length > 0 &&
    pageResourceIds.every((id) => selectedIds.has(id));
  const someOnPageSelected =
    pageResourceIds.some((id) => selectedIds.has(id)) && !allOnPageSelected;

  const handleSelectAll = useCallback(() => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      for (const id of pageResourceIds) {
        next.delete(id);
      }
    } else {
      for (const id of pageResourceIds) {
        next.add(id);
      }
    }
    onSelectionChange(next);
  }, [selectedIds, allOnPageSelected, pageResourceIds, onSelectionChange]);

  const handleToggle = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange]
  );

  const totalPages = Math.ceil(state.total / count);

  if (state.loading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
        <Text size="sm">Loading resources...</Text>
      </Group>
    );
  }

  if (state.error) {
    return (
      <Text c="red" px="sm" py="md">
        Error loading resources: {state.error}
      </Text>
    );
  }

  if (state.resources.length === 0) {
    return (
      <Text c="dimmed" px="sm" py="md">
        No resources found.
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={40}>
              <Checkbox
                checked={allOnPageSelected}
                indeterminate={someOnPageSelected}
                onChange={handleSelectAll}
                aria-label="Select all on page"
              />
            </Table.Th>
            {fields.map((field) => (
              <Table.Th key={field}>{field}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {state.resources.map((resource) => {
            const id = resource.id ?? '';
            return (
              <Table.Tr key={id}>
                <Table.Td>
                  <Checkbox
                    checked={selectedIds.has(id)}
                    onChange={() => handleToggle(id)}
                    aria-label={`Select ${resource.resourceType}/${id}`}
                  />
                </Table.Td>
                {fields.map((field) => (
                  <Table.Td key={field}>{getFieldValue(resource, field)}</Table.Td>
                ))}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      {totalPages > 1 && (
        <Group justify="center">
          <Pagination value={page} onChange={handlePageChange} total={totalPages} />
        </Group>
      )}
    </Stack>
  );
}

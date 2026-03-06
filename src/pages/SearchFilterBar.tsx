// ABOUTME: Horizontal filter bar for resource search pages with text inputs per resource type.
// ABOUTME: Syncs filter values with URL search params and auto-prepends Patient/ for reference fields.
import { ActionIcon, Group, Pill, Stack, TextInput } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { formatReferenceValue, getFiltersForResourceType } from './search-filters';

interface SearchFilterBarProps {
  readonly resourceType: string;
}

export function SearchFilterBar({ resourceType }: SearchFilterBarProps): JSX.Element | null {
  const filters = getFiltersForResourceType(resourceType);
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState<Record<string, string>>({});

  // Sync values from URL on mount and when URL changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const newValues: Record<string, string> = {};
    for (const filter of filters) {
      const raw = params.get(filter.code) ?? '';
      // Strip Patient/ prefix for display in reference fields
      if (filter.type === 'reference' && raw.startsWith('Patient/')) {
        newValues[filter.code] = raw.slice('Patient/'.length);
      } else {
        newValues[filter.code] = raw;
      }
    }
    setValues(newValues);
  }, [location.search, filters]);

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams(location.search);
    // Remove existing filter params and pagination
    for (const filter of filters) {
      params.delete(filter.code);
    }
    params.delete('_cursor');
    params.delete('_offset');

    // Set non-empty filter values
    for (const filter of filters) {
      const raw = values[filter.code] ?? '';
      if (!raw.trim()) continue;
      if (filter.type === 'reference') {
        params.set(filter.code, formatReferenceValue(raw));
      } else {
        params.set(filter.code, raw.trim());
      }
    }

    const qs = params.toString();
    navigate(`/${resourceType}${qs ? `?${qs}` : ''}`);
  }, [filters, location.search, navigate, resourceType, values]);

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(location.search);
    for (const filter of filters) {
      params.delete(filter.code);
    }
    params.delete('_cursor');
    params.delete('_offset');

    const cleared: Record<string, string> = {};
    for (const filter of filters) {
      cleared[filter.code] = '';
    }
    setValues(cleared);

    const qs = params.toString();
    navigate(`/${resourceType}${qs ? `?${qs}` : ''}`);
  }, [filters, location.search, navigate, resourceType]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        applyFilters();
      }
    },
    [applyFilters]
  );

  const removeFilter = useCallback(
    (code: string) => {
      const params = new URLSearchParams(location.search);
      params.delete(code);
      params.delete('_cursor');
      params.delete('_offset');
      const qs = params.toString();
      navigate(`/${resourceType}${qs ? `?${qs}` : ''}`);
    },
    [location.search, navigate, resourceType]
  );

  if (filters.length === 0) return null;

  const hasValues = filters.some((f) => (values[f.code] ?? '').trim() !== '');

  // Active filters read directly from URL params (source of truth)
  const params = new URLSearchParams(location.search);
  const activeFilters = filters
    .map((f) => ({ filter: f, value: params.get(f.code) }))
    .filter((entry): entry is { filter: typeof filters[number]; value: string } => !!entry.value);

  return (
    <Stack gap={0}>
      <Group gap="xs" px="sm" py="xs" wrap="nowrap">
        {filters.map((filter) => (
          <TextInput
            key={filter.code}
            placeholder={filter.label}
            size="xs"
            value={values[filter.code] ?? ''}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [filter.code]: e.currentTarget.value }))
            }
            onKeyDown={handleKeyDown}
            style={{ minWidth: 120, maxWidth: 200 }}
          />
        ))}
        <ActionIcon variant="filled" size="sm" onClick={applyFilters} aria-label="Apply filters">
          <IconSearch size={14} />
        </ActionIcon>
        {hasValues && (
          <ActionIcon variant="subtle" size="sm" onClick={clearFilters} aria-label="Clear filters">
            <IconX size={14} />
          </ActionIcon>
        )}
      </Group>
      {activeFilters.length > 0 && (
        <Group gap="xs" px="sm" pb="xs">
          {activeFilters.map(({ filter, value }) => {
            const display =
              filter.type === 'reference' && value.startsWith('Patient/')
                ? value.slice('Patient/'.length)
                : value;
            return (
              <Pill
                key={filter.code}
                withRemoveButton
                onRemove={() => removeFilter(filter.code)}
              >
                {filter.label}: {display}
              </Pill>
            );
          })}
        </Group>
      )}
    </Stack>
  );
}

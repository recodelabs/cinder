// ABOUTME: Lists resources of a given type with search, filters, and column configuration.
// ABOUTME: Uses Medplum's SearchControl with cursor-based pagination for GCP FHIR API.
import { formatSearchQuery, parseSearchRequest } from '@medplum/core';
import type { SearchRequest } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import type { SearchChangeEvent, SearchLoadEvent } from '@medplum/react';
import { SearchControl } from '@medplum/react';
import { Group, Stack, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ColumnConfig } from './ColumnConfig';
import { getDefaultSearch } from './search-defaults';
import { SearchFilterBar } from './SearchFilterBar';

function getPageNumber(search: SearchRequest): number {
  return Math.floor((search.offset ?? 0) / (search.count ?? 20)) + 1;
}

function extractPageToken(linkUrl: string): string | undefined {
  try {
    const url = new URL(linkUrl);
    return url.searchParams.get('_page_token') ?? undefined;
  } catch {
    return undefined;
  }
}

export function ResourceTypePage(): JSX.Element {
  const { resourceType } = useParams<{ resourceType: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const pageTokens = useRef<Record<number, string>>({});

  const search: SearchRequest = useMemo(() => {
    const parsed = parseSearchRequest(resourceType + location.search);
    const defaults = getDefaultSearch(resourceType ?? '');
    const merged = {
      ...defaults,
      ...parsed,
      resourceType: (resourceType ?? '') as ResourceType,
    };
    // Remove filters with null/undefined values — SearchControl crashes on them
    if (merged.filters) {
      merged.filters = merged.filters.filter((f) => f.value != null && f.value !== '');
    }
    return merged;
  }, [resourceType, location.search]);

  const currentPage = getPageNumber(search);

  const handleLoad = useCallback(
    (e: SearchLoadEvent) => {
      const nextLink = e.response.link?.find((l) => l.relation === 'next');
      if (nextLink?.url) {
        const token = extractPageToken(nextLink.url);
        if (token) {
          pageTokens.current[currentPage + 1] = token;
        }
      }
    },
    [currentPage]
  );

  const handleChange = useCallback(
    (e: SearchChangeEvent) => {
      const newDef = e.definition;
      const newPage = getPageNumber(newDef);

      if (newPage !== currentPage) {
        // Page change — use cursor-based navigation for GCP FHIR API
        const token = pageTokens.current[newPage];
        if (token) {
          navigate(`/${resourceType}${formatSearchQuery({ ...newDef, cursor: token })}`);
        } else if (newPage === 1) {
          const { cursor: _, ...rest } = newDef;
          navigate(`/${resourceType}${formatSearchQuery(rest)}`);
        } else {
          // No stored token (user jumped ahead); fall back to offset
          navigate(`/${resourceType}${formatSearchQuery(newDef)}`);
        }
      } else {
        // Non-page change (sort, filter, column) — reset page tokens
        pageTokens.current = {};
        const { cursor: _, ...rest } = newDef;
        navigate(`/${resourceType}${formatSearchQuery(rest)}`);
      }
    },
    [currentPage, navigate, resourceType]
  );

  const handleFieldsChange = useCallback(
    (newFields: string[]) => {
      const params = new URLSearchParams(location.search);
      params.set('_fields', newFields.join(','));
      navigate(`/${resourceType}?${params.toString()}`);
    },
    [location.search, navigate, resourceType],
  );

  return (
    <Stack gap={0}>
      <Group justify="space-between" px="sm" pt="sm">
        <Title order={3}>{resourceType}</Title>
        <ColumnConfig fields={search.fields ?? []} onChange={handleFieldsChange} />
      </Group>
      <SearchFilterBar resourceType={resourceType ?? ''} />
      <SearchControl
        key={resourceType}
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onChange={handleChange}
        onLoad={handleLoad}
        onNew={() => navigate(`/${resourceType}/new`)}
      />
    </Stack>
  );
}

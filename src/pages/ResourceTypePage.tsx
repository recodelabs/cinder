// ABOUTME: Lists resources of a given type with search, filters, and column configuration.
// ABOUTME: Uses Medplum's SearchControl for table rendering and search state management.
import { formatSearchQuery, parseSearchRequest } from '@medplum/core';
import type { SearchRequest } from '@medplum/core';
import { SearchControl } from '@medplum/react';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { getDefaultSearch } from './search-defaults';

export function ResourceTypePage(): JSX.Element {
  const { resourceType } = useParams<{ resourceType: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const search: SearchRequest = useMemo(() => {
    const parsed = parseSearchRequest(resourceType + location.search);
    const defaults = getDefaultSearch(resourceType ?? '');
    return {
      ...defaults,
      ...parsed,
      resourceType: resourceType ?? '',
    };
  }, [resourceType, location.search]);

  return (
    <SearchControl
      search={search}
      onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
      onChange={(e) => navigate(`/${resourceType}${formatSearchQuery(e.definition)}`)}
      onNew={() => navigate(`/${resourceType}/new`)}
    />
  );
}

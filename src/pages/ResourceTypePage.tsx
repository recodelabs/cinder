// ABOUTME: Lists resources of a given type from the FHIR store.
// ABOUTME: Fetches search results via MedplumClient and renders them in a table.
import { Alert, Loader, Stack, Title } from '@mantine/core';
import type { Bundle, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { SearchResultsTable } from './SearchResultsTable';

export function ResourceTypePage(): JSX.Element {
  const { resourceType } = useParams<{ resourceType: string }>();
  const medplum = useMedplum();
  const [bundle, setBundle] = useState<Bundle>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!resourceType) return;
    setLoading(true);
    setError(undefined);
    medplum
      .search(resourceType as ResourceType)
      .then(setBundle)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [medplum, resourceType]);

  return (
    <Stack>
      <Title order={2}>{resourceType}</Title>
      {loading && <Loader />}
      {error && <Alert color="red">{error.message}</Alert>}
      {bundle && <SearchResultsTable bundle={bundle} resourceType={resourceType ?? ''} />}
    </Stack>
  );
}

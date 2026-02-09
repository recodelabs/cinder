// ABOUTME: Fetches and displays a single FHIR resource.
// ABOUTME: Uses MedplumClient for fetching and ResourceDetail for rendering.
import { Alert, Loader, Stack } from '@mantine/core';
import type { Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ResourceDetail } from './ResourceDetail';

export function ResourceDetailPage(): JSX.Element {
  const { resourceType, id } = useParams<{ resourceType: string; id: string }>();
  const medplum = useMedplum();
  const [resource, setResource] = useState<Resource>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!resourceType || !id) return;
    setLoading(true);
    setError(undefined);
    medplum
      .readResource(resourceType as ResourceType, id)
      .then(setResource)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [medplum, resourceType, id]);

  return (
    <Stack>
      {loading && <Loader />}
      {error && <Alert color="red">{error.message}</Alert>}
      {resource && <ResourceDetail resource={resource} />}
    </Stack>
  );
}

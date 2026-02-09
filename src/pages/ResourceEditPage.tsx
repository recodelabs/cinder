// ABOUTME: Fetches a FHIR resource and renders it in an editable form.
// ABOUTME: Uses Medplum's ResourceForm for field rendering and saves via updateResource.
import { Alert, Loader, Stack } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import { ResourceForm } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

interface ResourceEditPageProps {
  readonly resourceType: string;
  readonly id: string;
}

export function ResourceEditPage({ resourceType, id }: ResourceEditPageProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [resource, setResource] = useState<Resource>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    setLoading(true);
    setError(undefined);
    medplum
      .readResource(resourceType as any, id)
      .then(setResource)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [medplum, resourceType, id]);

  const handleSubmit = useCallback(
    (updated: Resource) => {
      medplum
        .updateResource(updated)
        .then(() => navigate(`/${resourceType}/${id}`))
        .catch(setError);
    },
    [medplum, navigate, resourceType, id]
  );

  if (loading) {
    return <Loader />;
  }

  if (error) {
    return <Alert color="red">{error.message}</Alert>;
  }

  if (!resource) {
    return <Alert color="red">Resource not found</Alert>;
  }

  return (
    <Stack>
      <ResourceForm defaultValue={resource} onSubmit={handleSubmit} />
    </Stack>
  );
}

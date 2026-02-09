// ABOUTME: Page for creating a new FHIR resource.
// ABOUTME: Uses Medplum's ResourceForm with an empty default and saves via createResource.
import { Alert, Stack } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import { ResourceForm } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';

interface ResourceCreatePageProps {
  readonly resourceType: string;
}

export function ResourceCreatePage({ resourceType }: ResourceCreatePageProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [error, setError] = useState<Error>();

  const handleSubmit = useCallback(
    (resource: Resource) => {
      medplum
        .createResource(resource)
        .then((created) => navigate(`/${created.resourceType}/${created.id}`))
        .catch(setError);
    },
    [medplum, navigate]
  );

  return (
    <Stack>
      {error && <Alert color="red">{error.message}</Alert>}
      <ResourceForm
        defaultValue={{ resourceType } as Partial<Resource>}
        onSubmit={handleSubmit}
      />
    </Stack>
  );
}

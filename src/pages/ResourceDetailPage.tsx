// ABOUTME: Fetches and displays a single FHIR resource with tabbed navigation.
// ABOUTME: Tabs: Details (read-only view), Edit (form), JSON (raw editor).
import { Alert, Button, Group, Loader, Stack, Tabs } from '@mantine/core';
import type { Resource, ResourceType } from '@medplum/fhirtypes';
import { ResourceForm } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ResourceDetail } from './ResourceDetail';
import { ResourceHeader } from './ResourceHeader';
import { ResourceJsonTab } from './ResourceJsonTab';

export function ResourceDetailPage(): JSX.Element {
  const { resourceType, id, tab } = useParams<{ resourceType: string; id: string; tab: string }>();
  const medplum = useMedplum();
  const navigate = useNavigate();
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

  const handleDelete = useCallback(() => {
    if (!resourceType || !id) return;
    if (!window.confirm(`Delete this ${resourceType}?`)) return;
    medplum
      .deleteResource(resourceType as ResourceType, id)
      .then(() => navigate(`/${resourceType}`))
      .catch(setError);
  }, [medplum, navigate, resourceType, id]);

  const handleSubmit = useCallback(
    (updated: Resource) => {
      medplum
        .updateResource(updated)
        .then((saved) => {
          setResource(saved);
          navigate(`/${resourceType}/${id}`);
        })
        .catch(setError);
    },
    [medplum, navigate, resourceType, id]
  );

  const activeTab = tab ?? 'details';

  return (
    <Stack>
      {loading && <Loader />}
      {error && <Alert color="red">{error.message}</Alert>}
      {resource && (
        <>
          <ResourceHeader resource={resource} />
          <Tabs
            value={activeTab}
            onChange={(value) => {
              const path =
                value === 'details'
                  ? `/${resourceType}/${id}`
                  : `/${resourceType}/${id}/${value}`;
              navigate(path);
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Tabs.List>
                <Tabs.Tab value="details">Details</Tabs.Tab>
                <Tabs.Tab value="edit">Edit</Tabs.Tab>
                <Tabs.Tab value="json">JSON</Tabs.Tab>
              </Tabs.List>
              <Button variant="subtle" color="red" size="xs" onClick={handleDelete}>
                Delete
              </Button>
            </Group>
            <Tabs.Panel value="details" pt="md">
              <ResourceDetail resource={resource} />
            </Tabs.Panel>
            <Tabs.Panel value="edit" pt="md">
              <ResourceForm defaultValue={resource} onSubmit={handleSubmit} />
            </Tabs.Panel>
            <Tabs.Panel value="json" pt="md">
              <ResourceJsonTab resource={resource} onSubmit={handleSubmit} />
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Stack>
  );
}

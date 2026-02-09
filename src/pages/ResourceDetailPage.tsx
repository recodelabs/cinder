// ABOUTME: Displays a single FHIR resource with all its properties.
// ABOUTME: Placeholder — will use Medplum display components in Task 10.
import { Title } from '@mantine/core';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function ResourceDetailPage(): JSX.Element {
  const { resourceType, id } = useParams<{ resourceType: string; id: string }>();
  return <Title order={2}>{resourceType}/{id}</Title>;
}

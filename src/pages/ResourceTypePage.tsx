// ABOUTME: Lists resources of a given type from the FHIR store.
// ABOUTME: Placeholder — will fetch live data in Task 12.
import { Title } from '@mantine/core';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function ResourceTypePage(): JSX.Element {
  const { resourceType } = useParams<{ resourceType: string }>();
  return <Title order={2}>{resourceType}</Title>;
}

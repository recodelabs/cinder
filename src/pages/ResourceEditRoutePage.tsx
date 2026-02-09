// ABOUTME: Route wrapper that extracts URL params for the resource edit page.
// ABOUTME: Maps :resourceType/:id/edit to ResourceEditPage props.
import { Alert } from '@mantine/core';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { ResourceEditPage } from './ResourceEditPage';

export function ResourceEditRoutePage(): JSX.Element {
  const { resourceType, id } = useParams<{ resourceType: string; id: string }>();

  if (!resourceType || !id) {
    return <Alert color="red">Missing resource type or ID</Alert>;
  }

  return <ResourceEditPage resourceType={resourceType} id={id} />;
}

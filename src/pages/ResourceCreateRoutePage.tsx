// ABOUTME: Route wrapper that extracts URL params for the resource create page.
// ABOUTME: Maps :resourceType/new to ResourceCreatePage props.
import { Alert } from '@mantine/core';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { ResourceCreatePage } from './ResourceCreatePage';

export function ResourceCreateRoutePage(): JSX.Element {
  const { resourceType } = useParams<{ resourceType: string }>();

  if (!resourceType) {
    return <Alert color="red">Missing resource type</Alert>;
  }

  return <ResourceCreatePage resourceType={resourceType} />;
}

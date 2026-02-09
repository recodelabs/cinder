// ABOUTME: Displays a single FHIR resource using Medplum display components.
// ABOUTME: Renders all resource properties via the FHIR schema system.
import { getDataType } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { ResourcePropertyDisplay } from '@medplum/react';
import { Paper, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';

interface ResourceDetailProps {
  readonly resource: Resource;
}

export function ResourceDetail({ resource }: ResourceDetailProps): JSX.Element {
  const schema = getDataType(resource.resourceType);
  const elements = schema?.elements ?? {};

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        {Object.entries(elements).map(([key, element]) => {
          const value = (resource as Record<string, unknown>)[key];
          if (value === undefined || key === 'id' || key === 'resourceType' || key === 'meta') {
            return null;
          }
          return (
            <div key={key}>
              <Text size="sm" fw={600} c="dimmed">{key}</Text>
              <ResourcePropertyDisplay
                property={element}
                propertyType={element.type[0]?.code ?? 'string'}
                value={value}
              />
            </div>
          );
        })}
      </Stack>
    </Paper>
  );
}

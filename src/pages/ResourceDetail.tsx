// ABOUTME: Displays a single FHIR resource using Medplum display components.
// ABOUTME: Renders all resource properties via the FHIR schema system.
import { getDataType } from '@medplum/core';
import type { Reference, Resource } from '@medplum/fhirtypes';
import { ResourceName, ResourcePropertyDisplay } from '@medplum/react';
import { Group, Paper, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';

interface ResourceDetailProps {
  readonly resource: Resource;
}

function humanizeKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function isReferenceType(element: { type: { code?: string }[] }): boolean {
  return element.type.length === 1 && element.type[0]?.code === 'Reference';
}

function ReferenceValue({ value }: { readonly value: unknown }): JSX.Element {
  if (Array.isArray(value)) {
    return (
      <Group gap="xs">
        {value.map((ref: Reference, i: number) => (
          <ResourceName key={i} value={ref} link />
        ))}
      </Group>
    );
  }
  return <ResourceName value={value as Reference} link />;
}

export function ResourceDetail({ resource }: ResourceDetailProps): JSX.Element {
  const schema = getDataType(resource.resourceType);
  const elements = schema?.elements ?? {};

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        {Object.entries(elements).map(([key, element]) => {
          const value = (resource as unknown as Record<string, unknown>)[key];
          if (value === undefined || key === 'id' || key === 'resourceType' || key === 'meta' || key === 'text' || key === 'contained') {
            return null;
          }
          return (
            <div key={key}>
              <Text size="sm" fw={600} c="dimmed">{humanizeKey(key)}</Text>
              {isReferenceType(element) ? (
                <ReferenceValue value={value} />
              ) : (
                <ResourcePropertyDisplay
                  path={`${resource.resourceType}.${key}`}
                  property={element}
                  propertyType={element.type[0]?.code ?? 'string'}
                  value={value}
                />
              )}
            </div>
          );
        })}
      </Stack>
    </Paper>
  );
}

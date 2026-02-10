// ABOUTME: Displays a single FHIR resource using Medplum display components.
// ABOUTME: Renders all resource properties via the FHIR schema system.
import { getDataType } from '@medplum/core';
import type { Reference, Resource } from '@medplum/fhirtypes';
import { ResourceName, ResourcePropertyDisplay } from '@medplum/react';
import { Group, Paper, Table, Text } from '@mantine/core';
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

  const skipFields = new Set(['resourceType', 'meta', 'text', 'contained']);

  return (
    <Paper p="md" withBorder>
      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Td w={200}><Text size="sm" fw={600}>ID</Text></Table.Td>
            <Table.Td><Text size="sm">{resource.id}</Text></Table.Td>
          </Table.Tr>
          {Object.entries(elements).map(([key, element]) => {
            if (skipFields.has(key) || key === 'id') {
              return null;
            }
            const value = (resource as unknown as Record<string, unknown>)[key];
            return (
              <Table.Tr key={key}>
                <Table.Td w={200}><Text size="sm" fw={600}>{humanizeKey(key)}</Text></Table.Td>
                <Table.Td>
                  {value !== undefined && (
                    isReferenceType(element) ? (
                      <ReferenceValue value={value} />
                    ) : (
                      <ResourcePropertyDisplay
                        path={`${resource.resourceType}.${key}`}
                        property={element}
                        propertyType={element.type[0]?.code ?? 'string'}
                        value={value}
                      />
                    )
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

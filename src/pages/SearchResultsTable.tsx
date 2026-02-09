// ABOUTME: Renders FHIR search results as a table with clickable rows.
// ABOUTME: Uses getDisplayString from @medplum/core for resource summaries.
import { getDisplayString } from '@medplum/core';
import type { Bundle, Resource } from '@medplum/fhirtypes';
import { Table, Text } from '@mantine/core';
import type { JSX } from 'react';
import { Link } from 'react-router';

interface SearchResultsTableProps {
  readonly bundle: Bundle;
  readonly resourceType: string;
}

export function SearchResultsTable({ bundle, resourceType }: SearchResultsTableProps): JSX.Element {
  const entries = bundle.entry ?? [];

  if (entries.length === 0) {
    return <Text c="dimmed">No results found for {resourceType}.</Text>;
  }

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>ID</Table.Th>
          <Table.Th>Display</Table.Th>
          <Table.Th>Last Updated</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map((entry) => {
          const resource = entry.resource as Resource;
          if (!resource) {
            return null;
          }
          return (
            <Table.Tr key={resource.id} component={Link} to={`/${resource.resourceType}/${resource.id}`}>
              <Table.Td>{resource.id}</Table.Td>
              <Table.Td>{getDisplayString(resource)}</Table.Td>
              <Table.Td>{resource.meta?.lastUpdated}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

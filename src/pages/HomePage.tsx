// ABOUTME: Landing page showing available FHIR resource types.
// ABOUTME: Provides navigation cards to browse each resource type.
import { SimpleGrid, Card, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { RESOURCE_TYPES } from '../constants';

export function HomePage(): JSX.Element {
  return (
    <>
      <Title order={2} mb="md">Resource Types</Title>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }}>
        {RESOURCE_TYPES.map((type) => (
          <Card key={type} component={Link} to={`/${type}`} shadow="sm" padding="lg" withBorder>
            <Text fw={500}>{type}</Text>
          </Card>
        ))}
      </SimpleGrid>
    </>
  );
}

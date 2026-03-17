// ABOUTME: Card grid displaying all projects for the active organization.
// ABOUTME: Each card links to the project and allows switching; includes empty state and create button.
import { Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import { useOrg } from '../contexts/OrgContext';

export function ProjectsPage(): JSX.Element {
  const navigate = useNavigate();
  const { activeOrgSlug, projects, setActiveProject } = useOrg();

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Projects</Title>
        <Button component={Link} to={`/orgs/${activeOrgSlug}/projects/new`}>
          New Project
        </Button>
      </Group>
      {projects.length === 0 ? (
        <Text c="dimmed">No projects yet. Create one to get started.</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {projects.map((p) => (
            <Card
              key={p.id}
              withBorder
              shadow="sm"
              padding="md"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                setActiveProject(p);
                navigate(`/orgs/${activeOrgSlug}/projects/${p.slug}`);
              }}
            >
              <Text fw={500}>{p.name}</Text>
              {p.description && (
                <Text size="sm" mt="xs">
                  {p.description}
                </Text>
              )}
              <Text size="xs" c="dimmed" mt="xs">
                {p.gcpProject}/{p.gcpFhirStore}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}

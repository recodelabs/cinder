// ABOUTME: Banner header for the resource detail page.
// ABOUTME: Shows resource type, display name, and key fields like DOB and gender.
import { Avatar, Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import type { Patient, Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';

interface ResourceHeaderProps {
  readonly resource: Resource;
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function isPatient(resource: Resource): resource is Patient {
  return resource.resourceType === 'Patient';
}

export function ResourceHeader({ resource }: ResourceHeaderProps): JSX.Element {
  const displayName = getDisplayString(resource);
  const initials = getInitials(displayName);

  return (
    <Paper p="md" withBorder>
      <Group>
        <Avatar size="lg" radius="xl" color="blue">
          {initials}
        </Avatar>
        <Stack gap={2}>
          <Text fw={600} size="lg">
            {displayName}
          </Text>
          <Badge variant="light" size="sm">
            {resource.resourceType}
          </Badge>
        </Stack>
        {isPatient(resource) && (
          <Group ml="xl" gap="xl">
            {resource.birthDate && (
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase">DOB</Text>
                <Text size="sm">{resource.birthDate}</Text>
              </Stack>
            )}
            {resource.gender && (
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase">Gender</Text>
                <Text size="sm">{resource.gender}</Text>
              </Stack>
            )}
          </Group>
        )}
      </Group>
    </Paper>
  );
}

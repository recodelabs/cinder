// ABOUTME: Step 2 of merge duplicates — displays groups of phonetically similar resources.
// ABOUTME: Shows clickable group cards sorted by size, with resource count badges.
import { Alert, Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { DuplicateGroup } from './duplicateDetection';

interface Props {
  readonly resourceType: string;
  readonly groups: DuplicateGroup[];
  readonly onSelectGroup: (group: DuplicateGroup) => void;
  readonly onBack: () => void;
}

export function DuplicateGroupsStep({ resourceType, groups, onSelectGroup, onBack }: Props): JSX.Element {
  if (groups.length === 0) {
    return (
      <Stack gap="md">
        <Alert color="blue" title="No duplicates found">
          No potential duplicates were found for {resourceType}. Try a different resource type.
        </Alert>
        <Group>
          <Button variant="default" onClick={onBack}>← Back</Button>
        </Group>
      </Stack>
    );
  }

  const totalResources = groups.reduce((sum, g) => sum + g.resources.length, 0);

  return (
    <Stack gap="md">
      <Text c="dimmed">
        Found <Text span fw={700}>{groups.length} group{groups.length === 1 ? '' : 's'}</Text> of
        potential duplicates across {totalResources} {resourceType} resources.
      </Text>

      {groups.map((group) => (
        <Card
          key={group.phoneticKey}
          withBorder
          padding="md"
          style={{ cursor: 'pointer' }}
          onClick={() => onSelectGroup(group)}
        >
          <Group justify="space-between">
            <Group gap="sm">
              <Text fw={600}>{group.displayName}</Text>
              <Badge size="sm" variant="light">{group.resources.length} resources</Badge>
            </Group>
            <Text c="dimmed">→</Text>
          </Group>
        </Card>
      ))}

      <Group>
        <Button variant="default" onClick={onBack}>← Back</Button>
      </Group>
    </Stack>
  );
}

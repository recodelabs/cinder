// ABOUTME: Step 3 of merge duplicates — pick which resource to keep from a duplicate group.
// ABOUTME: Shows side-by-side resource details with click-to-select primary.
import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import type { DuplicateGroup } from './duplicateDetection';
import { extractDisplayName } from './duplicateDetection';

interface Props {
  readonly resourceType: string;
  readonly group: DuplicateGroup;
  readonly onConfirm: (primary: Resource) => void;
  readonly onBack: () => void;
}

type NamedResource = Resource & {
  readonly identifier?: ReadonlyArray<{ readonly system?: string; readonly value?: string }>;
  readonly telecom?: ReadonlyArray<{ readonly system?: string; readonly value?: string }>;
  readonly meta?: { readonly lastUpdated?: string };
};

export function SelectPrimaryStep({ resourceType, group, onConfirm, onBack }: Props): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedResource = group.resources.find((r) => r.id === selectedId);

  return (
    <Stack gap="md">
      <Text c="dimmed">
        Select the {resourceType} to <Text span fw={700}>keep</Text>. The others will be deleted and their references redirected.
      </Text>

      {group.resources.map((resource) => {
        const named = resource as NamedResource;
        const isSelected = resource.id === selectedId;
        const identifier = named.identifier?.[0];
        const phone = named.telecom?.find((t) => t.system === 'phone');
        const email = named.telecom?.find((t) => t.system === 'email');

        return (
          <Card
            key={resource.id}
            withBorder
            padding="md"
            style={{
              cursor: 'pointer',
              borderColor: isSelected ? 'var(--mantine-color-blue-6)' : undefined,
              borderWidth: isSelected ? 2 : undefined,
              opacity: selectedId && !isSelected ? 0.7 : 1,
            }}
            onClick={() => setSelectedId(resource.id ?? null)}
          >
            <Group justify="space-between">
              <Group gap="sm">
                <Text fw={600}>{extractDisplayName(resource)}</Text>
                <Text size="sm" c="dimmed">ID: {resource.id}</Text>
              </Group>
              {isSelected ? (
                <Badge color="blue" variant="filled">✓ Keep</Badge>
              ) : selectedId ? (
                <Badge color="red" variant="light">✗ Delete</Badge>
              ) : null}
            </Group>
            <Text size="sm" c="dimmed" mt="xs">
              {identifier ? `${identifier.system ?? 'ID'}: ${identifier.value}` : 'No identifier'}
              {phone ? ` · Phone: ${phone.value}` : ''}
              {email ? ` · Email: ${email.value}` : ''}
              {named.meta?.lastUpdated ? ` · Updated: ${named.meta.lastUpdated.slice(0, 10)}` : ''}
            </Text>
          </Card>
        );
      })}

      <Group>
        <Button variant="default" onClick={onBack}>← Back</Button>
        <Button
          disabled={!selectedResource}
          onClick={() => selectedResource && onConfirm(selectedResource)}
        >
          Preview Impact →
        </Button>
      </Group>
    </Stack>
  );
}

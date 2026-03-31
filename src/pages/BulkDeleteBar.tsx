// ABOUTME: Toolbar displayed during bulk delete mode with selection count and action buttons.
// ABOUTME: Shows selected resource count, Delete Selected button, and Cancel button.
import { Button, Group, Text } from '@mantine/core';
import { IconTrash, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';

interface BulkDeleteBarProps {
  readonly selectedCount: number;
  readonly onDelete: () => void;
  readonly onCancel: () => void;
}

export function BulkDeleteBar({
  selectedCount,
  onDelete,
  onCancel,
}: BulkDeleteBarProps): JSX.Element {
  return (
    <Group px="sm" py="xs" justify="space-between" bg="gray.0" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
      <Text size="sm" fw={500}>
        {selectedCount} resource{selectedCount !== 1 ? 's' : ''} selected
      </Text>
      <Group gap="xs">
        <Button
          size="xs"
          color="red"
          leftSection={<IconTrash size={14} />}
          disabled={selectedCount === 0}
          onClick={onDelete}
        >
          Delete Selected
        </Button>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconX size={14} />}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </Group>
    </Group>
  );
}

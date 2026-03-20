// ABOUTME: Draggable column configuration popover for resource list pages.
// ABOUTME: Lets users reorder visible columns via drag-and-drop using @dnd-kit.
import { ActionIcon, Group, Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconColumns, IconGripVertical } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ColumnConfigProps {
  readonly fields: readonly string[];
  readonly onChange: (fields: string[]) => void;
}

function SortableItem({ id }: { readonly id: string }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  return (
    <UnstyledButton
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      px="xs"
      py={4}
    >
      <Group gap="xs" wrap="nowrap">
        <IconGripVertical size={14} style={{ color: '#adb5bd', cursor: 'grab' }} />
        <Text size="sm">{id}</Text>
      </Group>
    </UnstyledButton>
  );
}

export function ColumnConfig({ fields, onChange }: ColumnConfigProps): JSX.Element {
  const [opened, setOpened] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = fields.indexOf(active.id as string);
        const newIndex = fields.indexOf(over.id as string);
        onChange(arrayMove([...fields], oldIndex, newIndex));
      }
    },
    [fields, onChange],
  );

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={220} shadow="md">
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={() => setOpened((o) => !o)}
          aria-label="Configure columns"
        >
          <IconColumns size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Text size="xs" c="dimmed" mb="xs" fw={500}>Drag to reorder columns</Text>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...fields]} strategy={verticalListSortingStrategy}>
            <Stack gap={0}>
              {fields.map((field) => (
                <SortableItem key={field} id={field} />
              ))}
            </Stack>
          </SortableContext>
        </DndContext>
      </Popover.Dropdown>
    </Popover>
  );
}

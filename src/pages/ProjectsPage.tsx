// ABOUTME: Card grid displaying all projects for the active organization.
// ABOUTME: Cards switch the active project; a per-card menu edits or deletes, with a delete confirmation.
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useOrg, type Project } from '../contexts/OrgContext';

export function ProjectsPage(): JSX.Element {
  const navigate = useNavigate();
  const { activeOrgSlug, projects, setActiveProject, deleteProject } = useOrg();
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [pendingDelete, setPendingDelete] = useState<Project | undefined>();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const requestDelete = (project: Project): void => {
    setError('');
    setPendingDelete(project);
    openConfirm();
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError('');
    try {
      await deleteProject(pendingDelete.id);
      closeConfirm();
      setPendingDelete(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

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
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text fw={500}>{p.name}</Text>
                <Menu shadow="md" position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={`Actions for ${p.name}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                    <Menu.Item
                      leftSection={<IconPencil size={14} />}
                      onClick={() => navigate(`/orgs/${activeOrgSlug}/projects/${p.slug}/edit`)}
                    >
                      Edit
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => requestDelete(p)}
                    >
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
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

      <Modal opened={confirmOpened} onClose={closeConfirm} title="Delete project" centered>
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to delete <strong>{pendingDelete?.name}</strong>? This removes the
            project from Cinder. The underlying GCP FHIR store is not affected.
          </Text>
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeConfirm} disabled={deleting}>
              Cancel
            </Button>
            <Button color="red" onClick={handleConfirmDelete} loading={deleting}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

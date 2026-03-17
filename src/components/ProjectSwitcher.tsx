// ABOUTME: Dropdown menu to switch between projects within the active organization.
// ABOUTME: Shows active project name, lists all projects with GCP details, and links to create.
import { Button, Menu, Text } from '@mantine/core';
import { IconChevronDown, IconDatabase, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { useOrg } from '../contexts/OrgContext';

export function ProjectSwitcher(): JSX.Element {
  const { activeOrgSlug, activeProject, projects, setActiveProject } = useOrg();

  if (!activeOrgSlug) {
    return <></>;
  }

  const label = activeProject?.name ?? 'Select Project';

  return (
    <Menu shadow="md" width={260}>
      <Menu.Target>
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconDatabase size={16} />}
          rightSection={<IconChevronDown size={14} />}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {projects.map((p) => (
          <Menu.Item
            key={p.id}
            onClick={() => setActiveProject(p)}
            fw={activeProject?.id === p.id ? 600 : undefined}
          >
            <Text size="sm">{p.name}</Text>
            <Text size="xs" c="dimmed">
              {p.gcpProject}/{p.gcpFhirStore}
            </Text>
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          component={Link}
          to={`/orgs/${activeOrgSlug}/projects/new`}
          leftSection={<IconPlus size={14} />}
        >
          Create Project
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

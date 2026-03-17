// ABOUTME: Dropdown menu to switch between organizations the user belongs to.
// ABOUTME: Shows active org name, lists all orgs, and links to create/settings.
import { Button, Menu } from '@mantine/core';
import { IconBuilding, IconChevronDown, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { authClient } from '../auth/auth-client';
import { useOrg } from '../contexts/OrgContext';

export function OrgSwitcher(): JSX.Element {
  const { activeOrgSlug, setActiveOrg } = useOrg();
  const { data: orgs } = authClient.useListOrganizations();

  const activeOrg = orgs?.find((o) => o.slug === activeOrgSlug);
  const label = activeOrg?.name ?? 'Select Org';

  return (
    <Menu shadow="md" width={220}>
      <Menu.Target>
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconBuilding size={16} />}
          rightSection={<IconChevronDown size={14} />}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {orgs?.map((org) => (
          <Menu.Item
            key={org.id}
            onClick={() => setActiveOrg(org.id)}
            fw={org.slug === activeOrgSlug ? 600 : undefined}
          >
            {org.name}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          component={Link}
          to="/orgs/new"
          leftSection={<IconPlus size={14} />}
        >
          Create Organization
        </Menu.Item>
        {activeOrgSlug && (
          <Menu.Item
            component={Link}
            to={`/orgs/${activeOrgSlug}/settings`}
          >
            Org Settings
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

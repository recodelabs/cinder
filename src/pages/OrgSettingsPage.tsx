// ABOUTME: Organization settings page with Members and Credentials tabs.
// ABOUTME: Members tab manages org membership; Credentials tab uploads GCP service account JSON.
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  FileInput,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconCheck, IconTrash, IconUpload } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { authClient } from '../auth/auth-client';
import { useOrg } from '../contexts/OrgContext';

interface Member {
  readonly userId: string;
  readonly role: string;
  readonly user?: {
    readonly email: string;
    readonly name: string;
  };
}

export function OrgSettingsPage(): JSX.Element {
  const { activeOrgId } = useOrg();

  return (
    <Stack gap="md">
      <Title order={2}>Organization Settings</Title>
      <Tabs defaultValue="members">
        <Tabs.List>
          <Tabs.Tab value="members">Members</Tabs.Tab>
          <Tabs.Tab value="credentials">Credentials</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="members" pt="md">
          {activeOrgId ? <MembersTab orgId={activeOrgId} /> : <Text c="dimmed">No organization selected</Text>}
        </Tabs.Panel>
        <Tabs.Panel value="credentials" pt="md">
          {activeOrgId ? <CredentialsTab orgId={activeOrgId} /> : <Text c="dimmed">No organization selected</Text>}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

interface TabProps {
  readonly orgId: string;
}

function MembersTab({ orgId }: TabProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const result = await authClient.organization.getFullOrganization({
        query: { organizationId: orgId },
      });
      const data = result.data as { members?: readonly Member[] } | null;
      setMembers(data?.members ?? []);
    } catch {
      setMembers([]);
    }
  }, [orgId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleAddMember = async (): Promise<void> => {
    setError('');
    setLoading(true);
    try {
      await fetch(`/api/orgs/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      setEmail('');
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string): Promise<void> => {
    try {
      await fetch(`/api/orgs/${orgId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await loadMembers();
    } catch {
      // ignore
    }
  };

  return (
    <Stack gap="md">
      <Group>
        <TextInput
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button onClick={handleAddMember} loading={loading} disabled={!email}>
          Add Member
        </Button>
      </Group>
      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Email</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {members.map((member) => (
            <Table.Tr key={member.userId}>
              <Table.Td>{member.user?.email ?? 'Pending'}</Table.Td>
              <Table.Td>
                <Badge size="sm" variant="light">
                  {member.role}
                </Badge>
              </Table.Td>
              <Table.Td>
                {member.role !== 'owner' && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => handleRemoveMember(member.userId)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function CredentialsTab({ orgId }: TabProps): JSX.Element {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState<'green' | 'red'>('green');

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/orgs/${orgId}/credential`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json() as { configured: boolean };
          setConfigured(data.configured);
        }
      } catch {
        setConfigured(false);
      }
    })();
  }, [orgId]);

  const handleUpload = async (file: File | null): Promise<void> => {
    if (!file) return;
    setMessage('');
    try {
      const text = await file.text();
      const response = await fetch(`/api/orgs/${orgId}/credential`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: text,
      });
      if (response.ok) {
        setMessage('Credentials saved successfully');
        setMessageColor('green');
        setConfigured(true);
      } else {
        setMessage('Failed to save credentials');
        setMessageColor('red');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to upload credentials');
      setMessageColor('red');
    }
  };

  return (
    <Stack gap="md">
      <Card withBorder>
        <Group>
          {configured ? (
            <>
              <IconCheck size={20} color="green" />
              <Text size="sm">Service account credentials are configured</Text>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              No service account credentials configured
            </Text>
          )}
        </Group>
      </Card>
      <FileInput
        label="Upload Service Account JSON"
        placeholder="Choose .json file"
        accept=".json"
        leftSection={<IconUpload size={16} />}
        onChange={handleUpload}
      />
      {message && (
        <Text size="sm" c={messageColor}>
          {message}
        </Text>
      )}
    </Stack>
  );
}

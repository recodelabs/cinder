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

interface Invitation {
  readonly id: string;
  readonly email: string;
  readonly role: string | null;
  readonly status: string;
}

export function OrgSettingsPage(): JSX.Element {
  const { activeOrgId, activeOrgAuthMode } = useOrg();
  const isServiceAccount = activeOrgAuthMode === 'service_account';

  const [tab, setTab] = useState<string>('members');

  return (
    <Stack gap="md">
      <Title order={2}>Organization Settings</Title>
      <Tabs value={tab} onChange={(v) => setTab(v ?? 'members')}>
        <Tabs.List>
          <Tabs.Tab value="members">Members</Tabs.Tab>
          {isServiceAccount && <Tabs.Tab value="credentials">Credentials</Tabs.Tab>}
        </Tabs.List>
      </Tabs>
      {tab === 'members' && (
        activeOrgId ? <MembersTab orgId={activeOrgId} /> : <Text c="dimmed">No organization selected</Text>
      )}
      {tab === 'credentials' && isServiceAccount && (
        activeOrgId ? <CredentialsTab orgId={activeOrgId} /> : <Text c="dimmed">No organization selected</Text>
      )}
    </Stack>
  );
}

interface TabProps {
  readonly orgId: string;
}

function MembersTab({ orgId }: TabProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [invitations, setInvitations] = useState<readonly Invitation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const result = await authClient.organization.getFullOrganization({
        query: { organizationId: orgId },
      });
      const data = result.data as { members?: readonly Member[]; invitations?: readonly Invitation[] } | null;
      setMembers(data?.members ?? []);
      setInvitations((data?.invitations ?? []).filter((i) => i.status === 'pending'));
    } catch {
      setMembers([]);
      setInvitations([]);
    }
  }, [orgId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleAddMember = async (): Promise<void> => {
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to add member');
      }
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
      const response = await fetch(`/api/orgs/${orgId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? 'Failed to remove member');
        return;
      }
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
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
            <Table.Th>Status</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {members.map((member) => (
            <Table.Tr key={member.userId}>
              <Table.Td>{member.user?.email ?? 'Unknown'}</Table.Td>
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
          {invitations.map((inv) => (
            <Table.Tr key={inv.id}>
              <Table.Td>{inv.email}</Table.Td>
              <Table.Td>
                <Badge size="sm" variant="light" color="yellow">
                  Invited
                </Badge>
              </Table.Td>
              <Table.Td />
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function CredentialsTab({ orgId }: TabProps): JSX.Element {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState<'green' | 'red'>('green');
  const [loading, setLoading] = useState(false);

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

  const handleUpload = async (): Promise<void> => {
    if (!file) return;
    setMessage('');
    setLoading(true);
    try {
      const text = await file.text();
      JSON.parse(text);
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
        setFile(null);
      } else {
        const body = await response.json().catch(() => ({}));
        setMessage((body as { error?: string }).error ?? 'Failed to save credentials');
        setMessageColor('red');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Invalid JSON file');
      setMessageColor('red');
    } finally {
      setLoading(false);
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
        label="Service Account JSON"
        placeholder="Select a .json file"
        accept=".json"
        value={file}
        onChange={setFile}
        leftSection={<IconUpload size={16} />}
      />
      <Button onClick={handleUpload} disabled={!file} loading={loading}>
        Upload Credentials
      </Button>
      {message && (
        <Text size="sm" c={messageColor}>
          {message}
        </Text>
      )}
    </Stack>
  );
}

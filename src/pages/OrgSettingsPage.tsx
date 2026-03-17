// ABOUTME: Organization settings page with Members and Credentials tabs.
// ABOUTME: Members tab manages org membership; Credentials tab uploads GCP service account JSON.
import {
  ActionIcon,
  Badge,
  Button,
  Card,
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
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const { activeOrgId, activeOrgAuthMode } = useOrg();
  const isServiceAccount = activeOrgAuthMode === 'service_account';

  return (
    <Stack gap="md">
      <Title order={2}>Organization Settings</Title>
      <Tabs defaultValue="members">
        <Tabs.List>
          <Tabs.Tab value="members">Members</Tabs.Tab>
          {isServiceAccount && <Tabs.Tab value="credentials">Credentials</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="members" pt="md">
          {activeOrgId ? <MembersTab orgId={activeOrgId} /> : <Text c="dimmed">No organization selected</Text>}
        </Tabs.Panel>
        {isServiceAccount && (
          <Tabs.Panel value="credentials" pt="md">
            {activeOrgId ? <CredentialsTab orgId={activeOrgId} /> : <Text c="dimmed">No organization selected</Text>}
          </Tabs.Panel>
        )}
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
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState<'green' | 'red'>('green');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
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
      if (fileRef.current) fileRef.current.value = '';
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
      <input
        ref={fileRef}
        id="sa-json-upload"
        type="file"
        accept=".json,application/json"
        onChange={handleFile}
        style={{ position: 'fixed', left: -9999, opacity: 0 }}
      />
      <Group>
        <Button
          leftSection={<IconUpload size={16} />}
          loading={loading}
          onClick={() => {
            fileRef.current?.click();
          }}
        >
          Choose .json file
        </Button>
        {fileName && <Text size="sm" c="dimmed">{fileName}</Text>}
      </Group>
      {message && (
        <Text size="sm" c={messageColor}>
          {message}
        </Text>
      )}
    </Stack>
  );
}

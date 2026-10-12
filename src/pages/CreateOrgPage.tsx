// ABOUTME: Form page to create a new organization with name, slug, and, for Google Cloud Healthcare API, an auth mode.
// ABOUTME: Auth mode decides whether GCP projects use a shared service account or each user's own Google token.
import { Button, Container, Radio, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { authClient } from '../auth/auth-client';
import { useOrg } from '../contexts/OrgContext';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function CreateOrgPage(): JSX.Element {
  const navigate = useNavigate();
  const { setActiveOrg } = useOrg();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [usesGcp, setUsesGcp] = useState(false);
  const [authMode, setAuthMode] = useState<'service_account' | 'user_token'>('service_account');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string): void => {
    setName(value);
    if (!slugTouched) {
      setSlug(toSlug(value));
    }
  };

  const handleSubmit = async (): Promise<void> => {
    setError('');
    setLoading(true);
    try {
      const result = await authClient.organization.create({
        name,
        slug,
        // FHIR server projects ignore the auth mode; service_account is the default either way.
        metadata: { authMode: usesGcp ? authMode : 'service_account' },
      });
      if (result.data) {
        setActiveOrg(result.data.id);
        const dest = usesGcp && authMode === 'service_account'
          ? `/orgs/${result.data.slug}/settings`
          : `/orgs/${result.data.slug}/projects`;
        navigate(dest);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size={400}>
      <Stack gap="md" mt="xl">
        <Title order={2}>Create Organization</Title>
        <TextInput
          label="Name"
          placeholder="My Organization"
          value={name}
          onChange={(e) => handleNameChange(e.currentTarget.value)}
          required
        />
        <TextInput
          label="Slug"
          placeholder="my-organization"
          value={slug}
          onChange={(e) => {
            setSlug(e.currentTarget.value);
            setSlugTouched(true);
          }}
          required
        />
        <Switch
          label="Google Cloud Healthcare API"
          description="Turn on if this org's projects use Google Cloud Healthcare API. FHIR servers such as HAPI don't need it."
          checked={usesGcp}
          onChange={(e) => setUsesGcp(e.currentTarget.checked)}
        />
        {usesGcp && (
          <Radio.Group
            label="FHIR Authentication"
            description="How members authenticate to the GCP Healthcare API"
            value={authMode}
            onChange={(v) => setAuthMode(v as typeof authMode)}
          >
            <Stack gap="xs" mt="xs">
              <Radio
                value="service_account"
                label="Service Account"
                description="Org owns a shared GCP service account — best for teams"
              />
              <Radio
                value="user_token"
                label="My Google Account"
                description="Each user's own Google OAuth token — requires personal GCP IAM access"
              />
            </Stack>
          </Radio.Group>
        )}
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        <Button onClick={handleSubmit} loading={loading} disabled={!name || !slug}>
          Create Organization
        </Button>
      </Stack>
    </Container>
  );
}

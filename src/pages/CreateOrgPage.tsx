// ABOUTME: Form page to create a new organization with name and slug.
// ABOUTME: Auto-generates slug from name, submits via auth client, navigates on success.
import { Button, Container, Stack, Text, TextInput, Title } from '@mantine/core';
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
      });
      if (result.data) {
        setActiveOrg(result.data.id);
        navigate(`/orgs/${result.data.slug}/settings`);
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

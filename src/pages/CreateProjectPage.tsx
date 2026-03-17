// ABOUTME: Form page to create a new project within the active organization.
// ABOUTME: Collects project name, description, and GCP coordinates, then POSTs to the API.
import { Button, Container, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useOrg } from '../contexts/OrgContext';

export function CreateProjectPage(): JSX.Element {
  const navigate = useNavigate();
  const { activeOrgId, activeOrgSlug, refreshProjects } = useOrg();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gcpProject, setGcpProject] = useState('');
  const [gcpLocation, setGcpLocation] = useState('');
  const [gcpDataset, setGcpDataset] = useState('');
  const [gcpFhirStore, setGcpFhirStore] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`/api/orgs/${activeOrgId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description,
          gcpProject,
          gcpLocation,
          gcpDataset,
          gcpFhirStore,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to create project');
      }
      await refreshProjects();
      navigate(`/orgs/${activeOrgSlug}/projects`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size={400}>
      <Stack gap="md" mt="xl">
        <Title order={2}>Create Project</Title>
        <TextInput
          label="Name"
          placeholder="My FHIR Project"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Textarea
          label="Description"
          placeholder="Optional description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <TextInput
          label="GCP Project"
          placeholder="my-gcp-project"
          value={gcpProject}
          onChange={(e) => setGcpProject(e.currentTarget.value)}
          required
        />
        <TextInput
          label="GCP Location"
          placeholder="us-central1"
          value={gcpLocation}
          onChange={(e) => setGcpLocation(e.currentTarget.value)}
          required
        />
        <TextInput
          label="GCP Dataset"
          placeholder="my-dataset"
          value={gcpDataset}
          onChange={(e) => setGcpDataset(e.currentTarget.value)}
          required
        />
        <TextInput
          label="GCP FHIR Store"
          placeholder="my-fhir-store"
          value={gcpFhirStore}
          onChange={(e) => setGcpFhirStore(e.currentTarget.value)}
          required
        />
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        <Button
          onClick={handleSubmit}
          loading={loading}
          disabled={!name || !gcpProject || !gcpLocation || !gcpDataset || !gcpFhirStore}
        >
          Create Project
        </Button>
      </Stack>
    </Container>
  );
}

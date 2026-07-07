// ABOUTME: Shared form for creating and editing a project's details and GCP coordinates.
// ABOUTME: Owns field state; the parent supplies initial values and the submit handler.
import { Button, Container, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';

export interface ProjectFormValues {
  name: string;
  description: string;
  gcpProject: string;
  gcpLocation: string;
  gcpDataset: string;
  gcpFhirStore: string;
}

interface ProjectFormProps {
  readonly title: string;
  readonly submitLabel: string;
  readonly initialValues?: Partial<ProjectFormValues>;
  readonly onSubmit: (values: ProjectFormValues) => Promise<void>;
}

export function ProjectForm({ title, submitLabel, initialValues, onSubmit }: ProjectFormProps): JSX.Element {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [gcpProject, setGcpProject] = useState(initialValues?.gcpProject ?? '');
  const [gcpLocation, setGcpLocation] = useState(initialValues?.gcpLocation ?? '');
  const [gcpDataset, setGcpDataset] = useState(initialValues?.gcpDataset ?? '');
  const [gcpFhirStore, setGcpFhirStore] = useState(initialValues?.gcpFhirStore ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    setError('');
    setLoading(true);
    try {
      await onSubmit({ name, description, gcpProject, gcpLocation, gcpDataset, gcpFhirStore });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size={400}>
      <Stack gap="md" mt="xl">
        <Title order={2}>{title}</Title>
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
          {submitLabel}
        </Button>
      </Stack>
    </Container>
  );
}

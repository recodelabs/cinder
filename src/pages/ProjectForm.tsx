// ABOUTME: Shared form for creating and editing a project's details and FHIR target.
// ABOUTME: Supports Google Cloud Healthcare API coordinates or a plain FHIR server base URL (e.g. local HAPI).
import { Button, Container, SegmentedControl, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import type { ProjectServerType } from '../contexts/OrgContext';

export interface ProjectFormValues {
  name: string;
  description: string;
  serverType: ProjectServerType;
  fhirBaseUrl: string;
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

const SERVER_TYPE_OPTIONS: { label: string; value: ProjectServerType }[] = [
  { label: 'Google Cloud Healthcare', value: 'gcp' },
  { label: 'FHIR server (HAPI, etc.)', value: 'fhir' },
];

export function ProjectForm({ title, submitLabel, initialValues, onSubmit }: ProjectFormProps): JSX.Element {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [serverType, setServerType] = useState<ProjectServerType>(initialValues?.serverType ?? 'gcp');
  const [fhirBaseUrl, setFhirBaseUrl] = useState(initialValues?.fhirBaseUrl ?? '');
  const [gcpProject, setGcpProject] = useState(initialValues?.gcpProject ?? '');
  const [gcpLocation, setGcpLocation] = useState(initialValues?.gcpLocation ?? '');
  const [gcpDataset, setGcpDataset] = useState(initialValues?.gcpDataset ?? '');
  const [gcpFhirStore, setGcpFhirStore] = useState(initialValues?.gcpFhirStore ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const targetComplete =
    serverType === 'fhir'
      ? fhirBaseUrl.trim() !== ''
      : Boolean(gcpProject && gcpLocation && gcpDataset && gcpFhirStore);

  const handleSubmit = async (): Promise<void> => {
    setError('');
    setLoading(true);
    try {
      await onSubmit({ name, description, serverType, fhirBaseUrl, gcpProject, gcpLocation, gcpDataset, gcpFhirStore });
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
        <Stack gap={4}>
          <Text size="sm" fw={500}>Server type</Text>
          <SegmentedControl
            aria-label="Server type"
            fullWidth
            data={SERVER_TYPE_OPTIONS}
            value={serverType}
            onChange={(value) => setServerType(value as ProjectServerType)}
          />
        </Stack>
        {serverType === 'fhir' ? (
          <TextInput
            label="FHIR base URL"
            description="R4 endpoint, no authentication. Must be on the server's allowed host list."
            placeholder="http://localhost:3447/fhir"
            value={fhirBaseUrl}
            onChange={(e) => setFhirBaseUrl(e.currentTarget.value)}
            required
          />
        ) : (
          <>
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
          </>
        )}
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        <Button onClick={handleSubmit} loading={loading} disabled={!name || !targetComplete}>
          {submitLabel}
        </Button>
      </Stack>
    </Container>
  );
}

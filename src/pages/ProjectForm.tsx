// ABOUTME: Shared form for creating and editing a project's details and FHIR target.
// ABOUTME: Supports Google Cloud Healthcare API coordinates or a plain FHIR server base URL, optionally with OAuth client credentials.
import { Button, Container, PasswordInput, SegmentedControl, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import type { ProjectServerType } from '../contexts/OrgContext';

export interface ProjectFormValues {
  name: string;
  description: string;
  serverType: ProjectServerType;
  fhirBaseUrl: string;
  fhirAuthEnabled: boolean;
  tokenUrl: string;
  clientId: string;
  /** Blank on edit means "keep the saved secret". */
  clientSecret: string;
  gcpProject: string;
  gcpLocation: string;
  gcpDataset: string;
  gcpFhirStore: string;
}

interface ProjectFormProps {
  readonly title: string;
  readonly submitLabel: string;
  readonly initialValues?: Partial<ProjectFormValues>;
  /** True when the project already has a saved client secret (the API never returns the secret). */
  readonly clientSecretSet?: boolean;
  readonly onSubmit: (values: ProjectFormValues) => Promise<void>;
}

const SERVER_TYPE_OPTIONS: { label: string; value: ProjectServerType }[] = [
  { label: 'Google Cloud Healthcare', value: 'gcp' },
  { label: 'FHIR server (HAPI, etc.)', value: 'fhir' },
];

/** Builds the project API request body; fhirAuth is null when authentication is off. */
export function projectRequestBody(values: ProjectFormValues): Record<string, unknown> {
  const { fhirAuthEnabled, tokenUrl, clientId, clientSecret, ...rest } = values;
  if (values.serverType !== 'fhir') {
    return rest;
  }
  return {
    ...rest,
    fhirAuth: fhirAuthEnabled
      ? { tokenUrl: tokenUrl.trim(), clientId: clientId.trim(), ...(clientSecret ? { clientSecret } : {}) }
      : null,
  };
}

export function ProjectForm({ title, submitLabel, initialValues, clientSecretSet = false, onSubmit }: ProjectFormProps): JSX.Element {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [serverType, setServerType] = useState<ProjectServerType>(initialValues?.serverType ?? 'gcp');
  const [fhirBaseUrl, setFhirBaseUrl] = useState(initialValues?.fhirBaseUrl ?? '');
  const [fhirAuthEnabled, setFhirAuthEnabled] = useState(initialValues?.fhirAuthEnabled ?? false);
  const [tokenUrl, setTokenUrl] = useState(initialValues?.tokenUrl ?? '');
  const [clientId, setClientId] = useState(initialValues?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [gcpProject, setGcpProject] = useState(initialValues?.gcpProject ?? '');
  const [gcpLocation, setGcpLocation] = useState(initialValues?.gcpLocation ?? '');
  const [gcpDataset, setGcpDataset] = useState(initialValues?.gcpDataset ?? '');
  const [gcpFhirStore, setGcpFhirStore] = useState(initialValues?.gcpFhirStore ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fhirAuthComplete =
    !fhirAuthEnabled || Boolean(tokenUrl.trim() && clientId.trim() && (clientSecret || clientSecretSet));
  const targetComplete =
    serverType === 'fhir'
      ? fhirBaseUrl.trim() !== '' && fhirAuthComplete
      : Boolean(gcpProject && gcpLocation && gcpDataset && gcpFhirStore);

  const handleSubmit = async (): Promise<void> => {
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        name,
        description,
        serverType,
        fhirBaseUrl,
        fhirAuthEnabled,
        tokenUrl,
        clientId,
        clientSecret,
        gcpProject,
        gcpLocation,
        gcpDataset,
        gcpFhirStore,
      });
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
          <>
            <TextInput
              label="FHIR base URL"
              description="R4 endpoint. Must be on the server's allowed host list."
              placeholder="http://localhost:3447/fhir"
              value={fhirBaseUrl}
              onChange={(e) => setFhirBaseUrl(e.currentTarget.value)}
              required
            />
            <Switch
              label="OAuth client credentials"
              description="For servers that need a Bearer token, e.g. FHIR Info Gateway with Keycloak."
              checked={fhirAuthEnabled}
              onChange={(e) => setFhirAuthEnabled(e.currentTarget.checked)}
            />
            {fhirAuthEnabled && (
              <>
                <TextInput
                  label="Token URL"
                  description="Its host must also be on the allowed host list."
                  placeholder="https://auth.example.org/realms/icr/protocol/openid-connect/token"
                  value={tokenUrl}
                  onChange={(e) => setTokenUrl(e.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Client ID"
                  placeholder="key-example"
                  value={clientId}
                  onChange={(e) => setClientId(e.currentTarget.value)}
                  required
                />
                <PasswordInput
                  label="Client secret"
                  description={
                    clientSecretSet
                      ? 'A secret is saved. Leave blank to keep it; enter it again if you change the token URL or client ID.'
                      : 'Stored encrypted on the server and never shown again.'
                  }
                  autoComplete="new-password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.currentTarget.value)}
                  required={!clientSecretSet}
                />
              </>
            )}
          </>
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

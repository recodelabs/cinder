// ABOUTME: Form for selecting which GCP FHIR store to browse.
// ABOUTME: Collects project, location, dataset, and store name.
import { Button, Center, Stack, TextInput, Title, Text } from '@mantine/core';
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { CinderLogo } from '../CinderLogo';
import type { StoreConfig } from './StoreConfig';
import { loadStoreConfig } from './StoreConfig';

interface StoreSelectorProps {
  readonly onSubmit: (config: StoreConfig) => void;
}

export function StoreSelector({ onSubmit }: StoreSelectorProps): JSX.Element {
  const saved = loadStoreConfig();
  const [project, setProject] = useState(saved?.project ?? import.meta.env.VITE_GCP_PROJECT ?? '');
  const [location, setLocation] = useState(saved?.location ?? import.meta.env.VITE_GCP_LOCATION ?? '');
  const [dataset, setDataset] = useState(saved?.dataset ?? import.meta.env.VITE_GCP_DATASET ?? '');
  const [fhirStore, setFhirStore] = useState(saved?.fhirStore ?? import.meta.env.VITE_GCP_FHIR_STORE ?? '');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit({ type: 'gcp', project, location, dataset, fhirStore });
    },
    [project, location, dataset, fhirStore, onSubmit]
  );

  return (
    <Center h="100vh">
      <form onSubmit={handleSubmit}>
        <Stack align="center" gap="lg" w={320}>
          <CinderLogo size={48} />
          <Title order={2}>Cinder</Title>
          <Text size="sm" c="dimmed">Connect to a FHIR store</Text>
          <TextInput label="Project ID" value={project} onChange={(e) => setProject(e.currentTarget.value)} required w="100%" />
          <TextInput label="Location" value={location} onChange={(e) => setLocation(e.currentTarget.value)} required w="100%" />
          <TextInput label="Dataset" value={dataset} onChange={(e) => setDataset(e.currentTarget.value)} required w="100%" />
          <TextInput label="FHIR Store" value={fhirStore} onChange={(e) => setFhirStore(e.currentTarget.value)} required w="100%" />
          <Button type="submit" fullWidth>Connect</Button>
        </Stack>
      </form>
    </Center>
  );
}

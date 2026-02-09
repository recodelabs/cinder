// ABOUTME: Form for selecting which GCP FHIR store to browse.
// ABOUTME: Collects project, location, dataset, and store name.
import { Button, Stack, TextInput } from '@mantine/core';
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import type { StoreConfig } from './StoreConfig';
import { loadStoreConfig } from './StoreConfig';

interface StoreSelectorProps {
  readonly onSubmit: (config: StoreConfig) => void;
}

export function StoreSelector({ onSubmit }: StoreSelectorProps): JSX.Element {
  const saved = loadStoreConfig();
  const [project, setProject] = useState(saved?.project ?? '');
  const [location, setLocation] = useState(saved?.location ?? '');
  const [dataset, setDataset] = useState(saved?.dataset ?? '');
  const [fhirStore, setFhirStore] = useState(saved?.fhirStore ?? '');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit({ project, location, dataset, fhirStore });
    },
    [project, location, dataset, fhirStore, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TextInput label="Project ID" value={project} onChange={(e) => setProject(e.currentTarget.value)} required />
        <TextInput label="Location" value={location} onChange={(e) => setLocation(e.currentTarget.value)} required />
        <TextInput label="Dataset" value={dataset} onChange={(e) => setDataset(e.currentTarget.value)} required />
        <TextInput label="FHIR Store" value={fhirStore} onChange={(e) => setFhirStore(e.currentTarget.value)} required />
        <Button type="submit">Connect</Button>
      </Stack>
    </form>
  );
}

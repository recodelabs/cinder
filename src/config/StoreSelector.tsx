// ABOUTME: Form for selecting which GCP FHIR store to browse.
// ABOUTME: Shows saved stores if authenticated and allows saving/deleting stores.
import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { CinderLogo } from '../CinderLogo';
import type { StoreConfig } from './StoreConfig';
import { loadStoreConfig } from './StoreConfig';
import type { SavedStore } from './stores-api';
import { createSavedStore, deleteSavedStore, listSavedStores } from './stores-api';

interface StoreSelectorProps {
  readonly onSubmit: (config: StoreConfig) => void;
  readonly accessToken?: string;
}

export function StoreSelector({ onSubmit, accessToken }: StoreSelectorProps): JSX.Element {
  const saved = loadStoreConfig();
  const [project, setProject] = useState(saved?.project ?? import.meta.env.VITE_GCP_PROJECT ?? '');
  const [location, setLocation] = useState(saved?.location ?? import.meta.env.VITE_GCP_LOCATION ?? '');
  const [dataset, setDataset] = useState(saved?.dataset ?? import.meta.env.VITE_GCP_DATASET ?? '');
  const [fhirStore, setFhirStore] = useState(saved?.fhirStore ?? import.meta.env.VITE_GCP_FHIR_STORE ?? '');
  const [storeName, setStoreName] = useState('');

  const [savedStores, setSavedStores] = useState<SavedStore[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!accessToken) return;
    setLoadingStores(true);
    listSavedStores(accessToken)
      .then(setSavedStores)
      .catch(() => {
        // Silently ignore - just don't show saved stores
      })
      .finally(() => setLoadingStores(false));
  }, [accessToken]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit({ type: 'gcp', project, location, dataset, fhirStore });
    },
    [project, location, dataset, fhirStore, onSubmit]
  );

  const handleConnectAndSave = useCallback(async () => {
    if (!accessToken || !storeName.trim()) return;
    setSaving(true);
    setError(undefined);
    try {
      const created = await createSavedStore(accessToken, {
        name: storeName.trim(),
        gcpProject: project,
        gcpLocation: location,
        gcpDataset: dataset,
        gcpFhirStore: fhirStore,
      });
      setSavedStores((prev) => [...prev, created]);
      onSubmit({ type: 'gcp', project, location, dataset, fhirStore });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save store');
    } finally {
      setSaving(false);
    }
  }, [accessToken, storeName, project, location, dataset, fhirStore, onSubmit]);

  const handleSavedStoreClick = useCallback(
    (store: SavedStore) => {
      onSubmit({
        type: 'gcp',
        project: store.gcpProject,
        location: store.gcpLocation,
        dataset: store.gcpDataset,
        fhirStore: store.gcpFhirStore,
      });
    },
    [onSubmit]
  );

  const handleDelete = useCallback(
    async (storeId: string) => {
      if (!accessToken) return;
      setError(undefined);
      try {
        await deleteSavedStore(accessToken, storeId);
        setSavedStores((prev) => prev.filter((s) => s.id !== storeId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete store');
      }
    },
    [accessToken]
  );

  const showSavedSection = accessToken && !loadingStores && savedStores.length > 0;
  const showConnectAndSave = accessToken && storeName.trim().length > 0;

  return (
    <Center h="100vh">
      <form onSubmit={handleSubmit}>
        <Stack align="center" gap="sm" w={400}>
          <Group gap={10} wrap="nowrap">
            <CinderLogo size={36} />
            <Title order={2}>Cinder</Title>
          </Group>
          <Text size="sm" c="dimmed">Connect to a FHIR store</Text>

          {loadingStores && <Loader size="sm" />}

          {error && (
            <Alert color="red" w="100%" onClose={() => setError(undefined)} withCloseButton>
              {error}
            </Alert>
          )}

          {showSavedSection && (
            <>
              <Text size="sm" fw={500}>Your Saved Stores</Text>
              <Stack gap="xs" w="100%">
                {savedStores.map((store) => (
                  <Paper
                    key={store.id}
                    withBorder
                    p="xs"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSavedStoreClick(store)}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2} style={{ flex: 1 }}>
                        <Text size="sm" fw={500}>{store.name}</Text>
                        <Text size="xs" c="dimmed">
                          {store.gcpProject}/{store.gcpDataset}/{store.gcpFhirStore}
                        </Text>
                      </Stack>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={`Delete ${store.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(store.id);
                        }}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Paper>
                ))}
              </Stack>
              <Divider label="Or connect manually" w="100%" />
            </>
          )}

          <TextInput label="Project ID" value={project} onChange={(e) => setProject(e.currentTarget.value)} required w="100%" />
          <TextInput label="Location" value={location} onChange={(e) => setLocation(e.currentTarget.value)} required w="100%" />
          <TextInput label="Dataset" value={dataset} onChange={(e) => setDataset(e.currentTarget.value)} required w="100%" />
          <TextInput label="FHIR Store" value={fhirStore} onChange={(e) => setFhirStore(e.currentTarget.value)} required w="100%" />
          <TextInput
            label="Store Name"
            placeholder="Optional - name to save this store"
            value={storeName}
            onChange={(e) => setStoreName(e.currentTarget.value)}
            w="100%"
          />

          <Group w="100%">
            <Button type="submit" style={{ flex: 1 }}>Connect</Button>
            {showConnectAndSave && (
              <Button
                style={{ flex: 1 }}
                variant="filled"
                loading={saving}
                onClick={handleConnectAndSave}
              >
                Connect &amp; Save
              </Button>
            )}
          </Group>
        </Stack>
      </form>
    </Center>
  );
}

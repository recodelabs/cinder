// ABOUTME: Step 1 of merge duplicates — select resource type and scan for duplicates.
// ABOUTME: Dropdown filtered to resource types with name fields, triggers duplicate detection.
import { Alert, Button, Group, Loader, Select, Stack, Text } from '@mantine/core';
import type { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { MERGEABLE_RESOURCE_TYPES } from '../../constants';
import { safeErrorMessage } from '../../errors';
import type { DuplicateGroup } from './duplicateDetection';
import { groupByPhoneticCode } from './duplicateDetection';

interface Props {
  readonly onScanComplete: (resourceType: string, groups: DuplicateGroup[]) => void;
}

export function SelectResourceTypeStep({ onScanComplete }: Props): JSX.Element {
  const medplum = useMedplum();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string>();

  const handleScan = async (): Promise<void> => {
    if (!selectedType) {
      return;
    }

    setScanning(true);
    setError(undefined);

    try {
      const allResources: Resource[] = [];
      let cursor: string | undefined;

      do {
        const params: Record<string, string> = { _count: '100' };
        if (cursor) {
          params._cursor = cursor;
        }

        const bundle: Bundle = await medplum.search(selectedType as ResourceType, params);

        for (const entry of bundle.entry ?? []) {
          if (entry.resource) {
            allResources.push(entry.resource);
          }
        }

        const nextLink = bundle.link?.find((l) => l.relation === 'next');
        if (nextLink?.url) {
          const url = new URL(nextLink.url, window.location.origin);
          cursor = url.searchParams.get('_cursor') ?? url.searchParams.get('_page_token') ?? undefined;
        } else {
          cursor = undefined;
        }
      } while (cursor);

      const groups = groupByPhoneticCode(allResources);
      onScanComplete(selectedType, groups);
    } catch (err) {
      setError(err instanceof Error ? safeErrorMessage(err) : String(err));
    } finally {
      setScanning(false);
    }
  };

  return (
    <Stack gap="md">
      <Text c="dimmed">Select a resource type to scan for potential duplicates using phonetic name matching.</Text>

      <Select
        label="Resource Type"
        placeholder="Select resource type"
        data={MERGEABLE_RESOURCE_TYPES.map((t) => ({ value: t, label: t }))}
        value={selectedType}
        onChange={setSelectedType}
        disabled={scanning}
      />

      {error && <Alert color="red" title="Scan failed">{error}</Alert>}

      <Group>
        <Button onClick={handleScan} disabled={!selectedType || scanning} loading={scanning}>
          {scanning ? 'Scanning...' : 'Scan for Duplicates'}
        </Button>
        {scanning && <Loader size="sm" />}
      </Group>
    </Stack>
  );
}

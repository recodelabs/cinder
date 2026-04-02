// ABOUTME: Step 4 of merge duplicates — shows reference impact and confirmation.
// ABOUTME: Displays count of references to rewrite per resource type before executing merge.
import { Alert, Button, Group, Loader, Stack, Table, Text } from '@mantine/core';
import type { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { RESOURCE_TYPES } from '../../constants';
import { safeErrorMessage } from '../../errors';
import type { DuplicateGroup } from './duplicateDetection';
import { extractDisplayName } from './duplicateDetection';

interface Props {
  readonly resourceType: string;
  readonly group: DuplicateGroup;
  readonly primaryResource: Resource;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

interface ReferenceImpact {
  readonly resourceType: string;
  readonly count: number;
}

export function PreviewStep({ resourceType, group, primaryResource, onConfirm, onBack }: Props): JSX.Element {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [impacts, setImpacts] = useState<ReferenceImpact[]>([]);

  const duplicates = useMemo(
    () => group.resources.filter((r) => r.id !== primaryResource.id),
    [group, primaryResource.id]
  );

  useEffect(() => {
    let cancelled = false;

    async function countReferences(): Promise<void> {
      setLoading(true);
      setError(undefined);

      try {
        const impactMap = new Map<string, number>();

        for (const duplicate of duplicates) {
          const refString = `${resourceType}/${duplicate.id}`;

          for (const searchType of RESOURCE_TYPES) {
            try {
              const bundle: Bundle = await medplum.search(searchType as ResourceType, {
                _content: refString,
                _count: '0',
                _total: 'accurate',
              });
              const count = bundle.total ?? 0;
              if (count > 0) {
                impactMap.set(searchType, (impactMap.get(searchType) ?? 0) + count);
              }
            } catch {
              // Skip resource types that fail
            }
          }
        }

        if (!cancelled) {
          setImpacts(
            Array.from(impactMap.entries())
              .map(([rt, count]) => ({ resourceType: rt, count }))
              .sort((a, b) => b.count - a.count)
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? safeErrorMessage(err) : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    countReferences();
    return () => { cancelled = true; };
  }, [medplum, resourceType, duplicates]);

  const totalReferences = impacts.reduce((sum, i) => sum + i.count, 0);

  if (loading) {
    return (
      <Stack gap="md" align="center">
        <Loader size="md" />
        <Text c="dimmed">Scanning for references to update...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap="md">
        <Alert color="red" title="Failed to scan references">{error}</Alert>
        <Group>
          <Button variant="default" onClick={onBack}>← Back</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text><Text span fw={700}>Merging into:</Text> {extractDisplayName(primaryResource)} ({primaryResource.id})</Text>
      <Text><Text span fw={700}>Deleting:</Text> {duplicates.length} duplicate resource{duplicates.length === 1 ? '' : 's'}</Text>

      {impacts.length > 0 ? (
        <>
          <Text fw={700}>References to update:</Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Resource Type</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>References</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {impacts.map((impact) => (
                <Table.Tr key={impact.resourceType}>
                  <Table.Td>{impact.resourceType}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{impact.count}</Table.Td>
                </Table.Tr>
              ))}
              <Table.Tr>
                <Table.Td fw={700}>Total</Table.Td>
                <Table.Td fw={700} style={{ textAlign: 'right' }}>{totalReferences}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </>
      ) : (
        <Text c="dimmed">No references found to update. The duplicates will be deleted directly.</Text>
      )}

      <Group>
        <Button variant="default" onClick={onBack}>← Back</Button>
        <Button color="red" onClick={onConfirm}>
          Merge & Delete Duplicates
        </Button>
      </Group>
    </Stack>
  );
}

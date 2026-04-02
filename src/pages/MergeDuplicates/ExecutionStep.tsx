// ABOUTME: Step 5 of merge duplicates — executes the merge with progress tracking.
// ABOUTME: Rewrites references, deletes duplicates, creates AuditEvent, shows progress bar.
import { Alert, Progress, Stack, Text } from '@mantine/core';
import type { AuditEvent, Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RESOURCE_TYPES } from '../../constants';
import { safeErrorMessage } from '../../errors';
import type { DuplicateGroup } from './duplicateDetection';
import type { MergeResult } from './MergeDuplicatesPage';
import { rewriteReferences } from './rewriteReferences';

interface Props {
  readonly resourceType: string;
  readonly group: DuplicateGroup;
  readonly primaryResource: Resource;
  readonly onComplete: (result: MergeResult) => void;
}

interface ProgressEntry {
  readonly resourceType: string;
  readonly status: 'pending' | 'done' | 'error';
  readonly count: number;
  readonly error?: string;
}

export function ExecutionStep({ resourceType, group, primaryResource, onComplete }: Props): JSX.Element {
  const medplum = useMedplum();
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>('Starting...');
  const [error, setError] = useState<string>();
  const startedRef = useRef(false);

  const duplicates = useMemo(
    () => group.resources.filter((r) => r.id !== primaryResource.id),
    [group, primaryResource.id]
  );

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    async function execute(): Promise<void> {
      let totalReferencesUpdated = 0;
      const affectedTypes = new Set<string>();

      try {
        for (const duplicate of duplicates) {
          setCurrentPhase(`Rewriting references for ${duplicate.id}...`);
          const refString = `${resourceType}/${duplicate.id}`;

          for (const searchType of RESOURCE_TYPES) {
            setProgress((prev) => [
              ...prev.filter((p) => p.resourceType !== searchType),
              { resourceType: searchType, status: 'pending', count: 0 },
            ]);

            try {
              let updatedCount = 0;
              let cursor: string | undefined;

              // Paginate through all matching resources
              do {
                const params: Record<string, string> = {
                  _content: refString,
                  _count: '100',
                };
                if (cursor) {
                  params._cursor = cursor;
                }

                const bundle: Bundle = await medplum.search(searchType as ResourceType, params);

                const resources = (bundle.entry ?? [])
                  .map((e) => e.resource)
                  .filter((r): r is Resource => r !== undefined);

                for (const res of resources) {
                  const rewritten = rewriteReferences(
                    res,
                    [duplicate.id!],
                    primaryResource.id!,
                    resourceType
                  );
                  if (rewritten) {
                    await medplum.updateResource(rewritten);
                    updatedCount++;
                    totalReferencesUpdated++;
                    affectedTypes.add(searchType);
                  }
                }

                // Extract next page cursor
                const nextLink = bundle.link?.find((l) => l.relation === 'next');
                if (nextLink?.url) {
                  const url = new URL(nextLink.url, window.location.origin);
                  cursor = url.searchParams.get('_cursor') ?? url.searchParams.get('_page_token') ?? undefined;
                } else {
                  cursor = undefined;
                }
              } while (cursor);

              setProgress((prev) => [
                ...prev.filter((p) => p.resourceType !== searchType),
                { resourceType: searchType, status: 'done', count: updatedCount },
              ]);
            } catch (err) {
              const message = err instanceof Error ? safeErrorMessage(err) : String(err);
              setProgress((prev) => [
                ...prev.filter((p) => p.resourceType !== searchType),
                { resourceType: searchType, status: 'error', count: 0, error: message },
              ]);
              throw new Error(`Failed to update ${searchType} references: ${message}`);
            }
          }

          setCurrentPhase(`Deleting duplicate ${duplicate.id}...`);
          await medplum.deleteResource(resourceType as ResourceType, duplicate.id!);
        }

        setCurrentPhase('Recording audit event...');
        const auditEvent: AuditEvent = {
          resourceType: 'AuditEvent',
          type: {
            system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
            code: 'rest',
            display: 'RESTful Operation',
          },
          subtype: [
            {
              system: 'http://cinder.health/audit-event-subtype',
              code: 'merge-duplicates',
              display: 'Merge Duplicate Resources',
            },
          ],
          action: 'U',
          recorded: new Date().toISOString(),
          outcome: '0',
          source: {
            observer: { display: 'Cinder' },
          },
          agent: [
            {
              who: { display: 'Cinder User' },
              requestor: true,
            },
          ],
          entity: [
            {
              what: { reference: `${resourceType}/${primaryResource.id}` },
              description: 'Primary resource (kept)',
            },
            ...duplicates.map((d) => ({
              what: { reference: `${resourceType}/${d.id}` },
              description: 'Duplicate resource (deleted)',
            })),
          ],
        };

        try {
          await medplum.createResource(auditEvent);
        } catch {
          // AuditEvent creation failure is non-fatal
        }

        onComplete({
          keptResource: primaryResource,
          deletedCount: duplicates.length,
          referencesUpdated: totalReferencesUpdated,
          resourceTypesAffected: affectedTypes.size,
        });
      } catch (err) {
        setError(err instanceof Error ? safeErrorMessage(err) : String(err));
      }
    }

    execute();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- startedRef guard ensures single execution
  }, [medplum, resourceType, duplicates, primaryResource]);

  const doneCount = progress.filter((p) => p.status === 'done').length;
  const totalSteps = RESOURCE_TYPES.length * duplicates.length;
  const percent = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;

  return (
    <Stack gap="md">
      <Text fw={700}>{currentPhase}</Text>
      <Progress value={percent} size="lg" animated />
      <Text size="sm" c="dimmed">{percent}% complete</Text>

      {error && (
        <Alert color="red" title="Merge failed">
          {error}
        </Alert>
      )}

      <Stack gap={4}>
        {progress
          .filter((p) => p.count > 0 || p.status === 'error')
          .map((p) => (
            <Text key={p.resourceType} size="sm">
              {p.status === 'done' ? '✓' : p.status === 'error' ? '✗' : '○'}{' '}
              {p.status === 'error'
                ? `${p.resourceType} — ${p.error}`
                : `Updated ${p.count} ${p.resourceType} reference${p.count === 1 ? '' : 's'}`}
            </Text>
          ))}
      </Stack>
    </Stack>
  );
}

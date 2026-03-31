// ABOUTME: Modal for confirming, executing, and displaying results of bulk resource deletion.
// ABOUTME: Shows confirmation prompt, progress bar during deletion, and success/failure summary.
import { Alert, Badge, Button, Group, Modal, Progress, Stack, Text } from '@mantine/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import { safeErrorMessage } from '../errors';

type Phase = 'confirm' | 'progress' | 'results';

interface DeleteResult {
  readonly id: string;
  readonly success: boolean;
  readonly error?: string;
}

interface BulkDeleteModalProps {
  readonly opened: boolean;
  readonly resourceType: string;
  readonly resourceIds: string[];
  readonly onClose: () => void;
  readonly onComplete: () => void;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return safeErrorMessage(err);
  return String(err);
}

export function BulkDeleteModal({
  opened,
  resourceType,
  resourceIds,
  onClose,
  onComplete,
}: BulkDeleteModalProps): JSX.Element {
  const medplum = useMedplum();
  const [phase, setPhase] = useState<Phase>('confirm');
  const [results, setResults] = useState<DeleteResult[]>([]);
  const [processed, setProcessed] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const cancelRef = useRef(false);

  const total = resourceIds.length;
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  const handleDelete = useCallback(async () => {
    setPhase('progress');
    setDeleting(true);
    setResults([]);
    setProcessed(0);
    cancelRef.current = false;

    const deleteResults: DeleteResult[] = [];

    for (const id of resourceIds) {
      if (cancelRef.current) break;
      try {
        await medplum.deleteResource(resourceType as ResourceType, id);
        deleteResults.push({ id, success: true });
      } catch (err: unknown) {
        deleteResults.push({ id, success: false, error: toErrorMessage(err) });
      }
      setProcessed(deleteResults.length);
      setResults([...deleteResults]);
    }

    setDeleting(false);
    setPhase('results');
  }, [medplum, resourceType, resourceIds]);

  const handleClose = useCallback(() => {
    if (phase === 'results') {
      onComplete();
    } else {
      onClose();
    }
    // Reset state for next open
    setPhase('confirm');
    setResults([]);
    setProcessed(0);
  }, [phase, onClose, onComplete]);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={phase === 'results' ? 'Deletion Results' : `Delete ${total} Resource${total !== 1 ? 's' : ''}`}
      closeOnClickOutside={!deleting}
      closeOnEscape={!deleting}
    >
      {phase === 'confirm' && (
        <Stack>
          <Text>
            You are about to delete {total} {resourceType} resource{total !== 1 ? 's' : ''}.
          </Text>
          <Text c="red" fw={500}>
            This action cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete}>
              Confirm Delete
            </Button>
          </Group>
        </Stack>
      )}

      {phase === 'progress' && (
        <Stack>
          <Progress
            value={total > 0 ? (processed / total) * 100 : 0}
            animated={deleting}
          />
          <Text size="sm">
            {processed} / {total} resources processed
          </Text>
          {deleting && (
            <Button
              variant="default"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              Cancel
            </Button>
          )}
        </Stack>
      )}

      {phase === 'results' && (
        <Stack>
          <Group>
            <Badge color="green" size="lg">
              {successCount} deleted
            </Badge>
            {failureCount > 0 && (
              <Badge color="red" size="lg">
                {failureCount} failed
              </Badge>
            )}
          </Group>

          {failureCount > 0 && (
            <Stack gap="xs">
              <Text fw={500}>Failures:</Text>
              {results
                .filter((r) => !r.success)
                .map((r) => (
                  <Alert key={r.id} color="red" variant="light">
                    {resourceType}/{r.id}: {r.error}
                  </Alert>
                ))}
            </Stack>
          )}

          <Group justify="flex-end">
            <Button onClick={handleClose}>Done</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

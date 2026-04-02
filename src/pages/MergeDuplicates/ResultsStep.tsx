// ABOUTME: Step 6 of merge duplicates — shows summary of completed merge operation.
// ABOUTME: Displays kept resource, deleted count, references updated, and next actions.
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { extractDisplayName } from './duplicateDetection';
import type { MergeResult } from './MergeDuplicatesPage';

interface Props {
  readonly result: MergeResult;
  readonly resourceType: string;
  readonly onMergeMore: () => void;
}

export function ResultsStep({ result, resourceType, onMergeMore }: Props): JSX.Element {
  const navigate = useNavigate();

  return (
    <Stack gap="md">
      <Alert color="green" title="Merge completed successfully">
        <Stack gap={4}>
          <Text size="sm">Kept: {extractDisplayName(result.keptResource)} ({result.keptResource.id})</Text>
          <Text size="sm">Deleted: {result.deletedCount} duplicate {resourceType}{result.deletedCount === 1 ? '' : 's'}</Text>
          <Text size="sm">Updated: {result.referencesUpdated} reference{result.referencesUpdated === 1 ? '' : 's'} across {result.resourceTypesAffected} resource type{result.resourceTypesAffected === 1 ? '' : 's'}</Text>
        </Stack>
      </Alert>

      <Group>
        <Button onClick={onMergeMore}>Merge More Duplicates</Button>
        <Button
          variant="default"
          onClick={() => navigate(`/${resourceType}/${result.keptResource.id}`)}
        >
          View Kept Resource
        </Button>
      </Group>
    </Stack>
  );
}

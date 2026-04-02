// ABOUTME: Step 6 of merge duplicates — shows summary of completed merge operation.
// ABOUTME: Displays kept resource, deleted count, references updated, and next actions.
import { Text } from '@mantine/core';
import type { JSX } from 'react';
import type { MergeResult } from './MergeDuplicatesPage';

interface Props {
  readonly result: MergeResult;
  readonly resourceType: string;
  readonly onMergeMore: () => void;
}

export function ResultsStep(_props: Props): JSX.Element {
  return <Text>Results step — not yet implemented</Text>;
}

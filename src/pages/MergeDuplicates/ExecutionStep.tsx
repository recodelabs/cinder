// ABOUTME: Step 5 of merge duplicates — executes the merge with progress tracking.
// ABOUTME: Rewrites references, deletes duplicates, creates AuditEvent, shows progress bar.
import { Text } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { DuplicateGroup } from './duplicateDetection';
import type { MergeResult } from './MergeDuplicatesPage';

interface Props {
  readonly resourceType: string;
  readonly group: DuplicateGroup;
  readonly primaryResource: Resource;
  readonly onComplete: (result: MergeResult) => void;
}

export function ExecutionStep(_props: Props): JSX.Element {
  return <Text>Execution step — not yet implemented</Text>;
}

// ABOUTME: Step 1 of merge duplicates — select resource type and scan for duplicates.
// ABOUTME: Dropdown filtered to resource types with name fields, triggers duplicate detection.
import { Text } from '@mantine/core';
import type { JSX } from 'react';
import type { DuplicateGroup } from './duplicateDetection';

interface Props {
  readonly onScanComplete: (resourceType: string, groups: DuplicateGroup[]) => void;
}

export function SelectResourceTypeStep(_props: Props): JSX.Element {
  return <Text>Select resource type step — not yet implemented</Text>;
}

// ABOUTME: Step 2 of merge duplicates — displays groups of phonetically similar resources.
// ABOUTME: Shows clickable group cards sorted by size, with resource count badges.
import { Text } from '@mantine/core';
import type { JSX } from 'react';
import type { DuplicateGroup } from './duplicateDetection';

interface Props {
  readonly resourceType: string;
  readonly groups: DuplicateGroup[];
  readonly onSelectGroup: (group: DuplicateGroup) => void;
  readonly onBack: () => void;
}

export function DuplicateGroupsStep(_props: Props): JSX.Element {
  return <Text>Duplicate groups step — not yet implemented</Text>;
}

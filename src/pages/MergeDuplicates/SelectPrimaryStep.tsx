// ABOUTME: Step 3 of merge duplicates — pick which resource to keep from a duplicate group.
// ABOUTME: Shows side-by-side resource details with click-to-select primary.
import { Text } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { DuplicateGroup } from './duplicateDetection';

interface Props {
  readonly resourceType: string;
  readonly group: DuplicateGroup;
  readonly onConfirm: (primary: Resource) => void;
  readonly onBack: () => void;
}

export function SelectPrimaryStep(_props: Props): JSX.Element {
  return <Text>Select primary step — not yet implemented</Text>;
}

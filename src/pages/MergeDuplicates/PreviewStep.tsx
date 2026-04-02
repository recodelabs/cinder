// ABOUTME: Step 4 of merge duplicates — shows reference impact and confirmation.
// ABOUTME: Displays count of references to rewrite per resource type before executing merge.
import { Text } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { DuplicateGroup } from './duplicateDetection';

interface Props {
  readonly resourceType: string;
  readonly group: DuplicateGroup;
  readonly primaryResource: Resource;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

export function PreviewStep(_props: Props): JSX.Element {
  return <Text>Preview step — not yet implemented</Text>;
}

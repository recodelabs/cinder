// ABOUTME: Parent wizard page for the merge duplicates admin feature.
// ABOUTME: Manages step state and shared data across the 6-step merge flow.
import { Stack, Title } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import type { DuplicateGroup } from './duplicateDetection';
import { SelectResourceTypeStep } from './SelectResourceTypeStep';
import { DuplicateGroupsStep } from './DuplicateGroupsStep';
import { SelectPrimaryStep } from './SelectPrimaryStep';
import { PreviewStep } from './PreviewStep';
import { ExecutionStep } from './ExecutionStep';
import { ResultsStep } from './ResultsStep';

type Step = 'selectType' | 'groups' | 'selectPrimary' | 'preview' | 'execute' | 'results';

export interface MergeResult {
  readonly keptResource: Resource;
  readonly deletedCount: number;
  readonly referencesUpdated: number;
  readonly resourceTypesAffected: number;
}

export function MergeDuplicatesPage(): JSX.Element {
  const [step, setStep] = useState<Step>('selectType');
  const [resourceType, setResourceType] = useState<string>('');
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [primaryResource, setPrimaryResource] = useState<Resource | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);

  return (
    <Stack gap="lg">
      <Title order={2}>Merge Duplicates</Title>

      {step === 'selectType' && (
        <SelectResourceTypeStep
          onScanComplete={(type, foundGroups) => {
            setResourceType(type);
            setGroups(foundGroups);
            setStep('groups');
          }}
        />
      )}

      {step === 'groups' && (
        <DuplicateGroupsStep
          resourceType={resourceType}
          groups={groups}
          onSelectGroup={(group) => {
            setSelectedGroup(group);
            setStep('selectPrimary');
          }}
          onBack={() => setStep('selectType')}
        />
      )}

      {step === 'selectPrimary' && selectedGroup && (
        <SelectPrimaryStep
          resourceType={resourceType}
          group={selectedGroup}
          onConfirm={(primary) => {
            setPrimaryResource(primary);
            setStep('preview');
          }}
          onBack={() => setStep('groups')}
        />
      )}

      {step === 'preview' && selectedGroup && primaryResource && (
        <PreviewStep
          resourceType={resourceType}
          group={selectedGroup}
          primaryResource={primaryResource}
          onConfirm={() => setStep('execute')}
          onBack={() => setStep('selectPrimary')}
        />
      )}

      {step === 'execute' && selectedGroup && primaryResource && (
        <ExecutionStep
          resourceType={resourceType}
          group={selectedGroup}
          primaryResource={primaryResource}
          onComplete={(result) => {
            setMergeResult(result);
            setStep('results');
          }}
        />
      )}

      {step === 'results' && mergeResult && (
        <ResultsStep
          result={mergeResult}
          resourceType={resourceType}
          onMergeMore={() => {
            setStep('selectType');
            setGroups([]);
            setSelectedGroup(null);
            setPrimaryResource(null);
            setMergeResult(null);
          }}
        />
      )}
    </Stack>
  );
}

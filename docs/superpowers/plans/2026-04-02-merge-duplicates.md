# Merge Duplicates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin page that detects duplicate FHIR resources via phonetic name matching, lets users pick which to keep, rewrites references, deletes duplicates, and records an AuditEvent.

**Architecture:** Single-page wizard with extracted step components at `/merge-duplicates`. Uses Double Metaphone for phonetic grouping. Reference rewriting uses `_content` search to find all references across resource types, then deep-walks JSON to rewrite `reference` fields. Follows existing admin page patterns (DeletePatientResourcesPage, BulkLoadPage).

**Tech Stack:** React 19, Mantine 8, Medplum client, `double-metaphone` npm package, Vitest + Testing Library

---

## File Structure

```
src/pages/MergeDuplicates/
├── MergeDuplicatesPage.tsx           # Parent wizard — manages step state, renders active step
├── SelectResourceTypeStep.tsx        # Step 1: resource type dropdown + "Scan" button
├── DuplicateGroupsStep.tsx           # Step 2: list of phonetic match groups
├── SelectPrimaryStep.tsx             # Step 3: pick which resource to keep
├── PreviewStep.tsx                   # Step 4: reference impact table + confirm
├── ExecutionStep.tsx                 # Step 5: progress bar during merge
├── ResultsStep.tsx                   # Step 6: summary of what happened
├── duplicateDetection.ts             # fetchAndGroupDuplicates(), name extraction, phonetic grouping
├── duplicateDetection.test.ts        # Unit tests for grouping logic
├── rewriteReferences.ts              # rewriteReferences() — generalized deep-walk rewriter
├── rewriteReferences.test.ts         # Unit tests for reference rewriting
├── MergeDuplicatesPage.test.tsx      # Integration tests for the wizard flow
```

**Modified files:**
- `src/App.tsx:61-71` — add `/merge-duplicates` route
- `src/Shell.tsx:152-167` — add nav link under Admin section
- `src/constants.ts` — add `MERGEABLE_RESOURCE_TYPES` constant

---

### Task 1: Install double-metaphone and add mergeable types constant

**Files:**
- Modify: `package.json`
- Modify: `src/constants.ts:1-32`

- [ ] **Step 1: Install double-metaphone**

```bash
bun add double-metaphone
```

- [ ] **Step 2: Add MERGEABLE_RESOURCE_TYPES to constants.ts**

Add after the existing `RESOURCE_TYPES` array in `src/constants.ts`:

```typescript
/**
 * Resource types that support duplicate detection via name matching.
 * These types have a `name` field (HumanName[] or string).
 */
export const MERGEABLE_RESOURCE_TYPES = [
  'Patient',
  'Practitioner',
  'RelatedPerson',
  'Organization',
] as const;
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb src/constants.ts
git commit -m "feat(merge): install double-metaphone and add mergeable resource types"
```

---

### Task 2: Duplicate detection logic

**Files:**
- Create: `src/pages/MergeDuplicates/duplicateDetection.ts`
- Create: `src/pages/MergeDuplicates/duplicateDetection.test.ts`

- [ ] **Step 1: Write failing tests for name extraction and phonetic grouping**

Create `src/pages/MergeDuplicates/duplicateDetection.test.ts`:

```typescript
// ABOUTME: Tests for duplicate detection logic — name extraction and phonetic grouping.
// ABOUTME: Verifies Double Metaphone phonetic matching groups similar names correctly.
import { describe, expect, it } from 'vitest';
import type { Organization, Practitioner } from '@medplum/fhirtypes';
import { extractDisplayName, groupByPhoneticCode } from './duplicateDetection';

describe('extractDisplayName', () => {
  it('extracts family + given from HumanName', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: '1',
      name: [{ family: 'Smith', given: ['John'] }],
    };
    expect(extractDisplayName(practitioner)).toBe('Smith John');
  });

  it('extracts string name from Organization', () => {
    const org: Organization = {
      resourceType: 'Organization',
      id: '1',
      name: 'Acme Health',
    };
    expect(extractDisplayName(org)).toBe('Acme Health');
  });

  it('returns empty string when no name', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: '1',
    };
    expect(extractDisplayName(practitioner)).toBe('');
  });

  it('uses first name entry for HumanName array', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: '1',
      name: [
        { family: 'Smith', given: ['John'], use: 'official' },
        { family: 'Smithy', given: ['Johnny'], use: 'nickname' },
      ],
    };
    expect(extractDisplayName(practitioner)).toBe('Smith John');
  });
});

describe('groupByPhoneticCode', () => {
  it('groups practitioners with phonetically similar names', () => {
    const resources: Practitioner[] = [
      { resourceType: 'Practitioner', id: '1', name: [{ family: 'Smith', given: ['John'] }] },
      { resourceType: 'Practitioner', id: '2', name: [{ family: 'Smyth', given: ['Jon'] }] },
      { resourceType: 'Practitioner', id: '3', name: [{ family: 'Jones', given: ['Alice'] }] },
    ];
    const groups = groupByPhoneticCode(resources);
    // Smith and Smyth should be in the same group
    const smithGroup = groups.find((g) => g.resources.some((r) => r.id === '1'));
    expect(smithGroup).toBeDefined();
    expect(smithGroup!.resources).toHaveLength(2);
    expect(smithGroup!.resources.map((r) => r.id).sort()).toEqual(['1', '2']);
  });

  it('filters out groups with only one resource', () => {
    const resources: Practitioner[] = [
      { resourceType: 'Practitioner', id: '1', name: [{ family: 'Smith', given: ['John'] }] },
      { resourceType: 'Practitioner', id: '2', name: [{ family: 'Jones', given: ['Alice'] }] },
    ];
    const groups = groupByPhoneticCode(resources);
    expect(groups).toHaveLength(0);
  });

  it('sorts groups by size descending', () => {
    const resources: Practitioner[] = [
      { resourceType: 'Practitioner', id: '1', name: [{ family: 'Smith', given: ['John'] }] },
      { resourceType: 'Practitioner', id: '2', name: [{ family: 'Smyth', given: ['Jon'] }] },
      { resourceType: 'Practitioner', id: '3', name: [{ family: 'Johnson', given: ['Bob'] }] },
      { resourceType: 'Practitioner', id: '4', name: [{ family: 'Jonson', given: ['Bob'] }] },
      { resourceType: 'Practitioner', id: '5', name: [{ family: 'Johnsen', given: ['Bob'] }] },
    ];
    const groups = groupByPhoneticCode(resources);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    // Groups should be sorted largest first
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1]!.resources.length).toBeGreaterThanOrEqual(groups[i]!.resources.length);
    }
  });

  it('skips resources with no name', () => {
    const resources: Practitioner[] = [
      { resourceType: 'Practitioner', id: '1', name: [{ family: 'Smith', given: ['John'] }] },
      { resourceType: 'Practitioner', id: '2' },
      { resourceType: 'Practitioner', id: '3', name: [{ family: 'Smyth', given: ['Jon'] }] },
    ];
    const groups = groupByPhoneticCode(resources);
    const smithGroup = groups.find((g) => g.resources.some((r) => r.id === '1'));
    expect(smithGroup).toBeDefined();
    expect(smithGroup!.resources).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test src/pages/MergeDuplicates/duplicateDetection.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement duplicateDetection.ts**

Create `src/pages/MergeDuplicates/duplicateDetection.ts`:

```typescript
// ABOUTME: Duplicate detection logic using Double Metaphone phonetic matching.
// ABOUTME: Groups FHIR resources by phonetically similar names to surface duplicate candidates.
import { doubleMetaphone } from 'double-metaphone';
import type { Resource } from '@medplum/fhirtypes';

interface HumanNameResource extends Resource {
  readonly name?: ReadonlyArray<{
    readonly family?: string;
    readonly given?: readonly string[];
  }>;
}

interface StringNameResource extends Resource {
  readonly name?: string;
}

export interface DuplicateGroup {
  readonly phoneticKey: string;
  readonly displayName: string;
  readonly resources: Resource[];
}

/**
 * Extracts a display name string from a FHIR resource.
 * For HumanName types (Patient, Practitioner, RelatedPerson): "family given1 given2"
 * For string name types (Organization): the name string directly.
 */
export function extractDisplayName(resource: Resource): string {
  if (resource.resourceType === 'Organization') {
    return (resource as StringNameResource).name ?? '';
  }

  const humanNameResource = resource as HumanNameResource;
  const nameEntry = humanNameResource.name?.[0];
  if (!nameEntry) {
    return '';
  }

  const parts: string[] = [];
  if (nameEntry.family) {
    parts.push(nameEntry.family);
  }
  if (nameEntry.given) {
    parts.push(...nameEntry.given);
  }
  return parts.join(' ');
}

/**
 * Generates a phonetic key for a resource's name using Double Metaphone.
 * Combines the primary metaphone codes of all name parts.
 */
function phoneticKey(name: string): string {
  if (!name) {
    return '';
  }
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.map((part) => doubleMetaphone(part)[0]).join('|');
}

/**
 * Groups resources by phonetic name similarity.
 * Returns only groups with 2+ resources, sorted by group size descending.
 */
export function groupByPhoneticCode(resources: Resource[]): DuplicateGroup[] {
  const groups = new Map<string, { displayName: string; resources: Resource[] }>();

  for (const resource of resources) {
    const name = extractDisplayName(resource);
    if (!name) {
      continue;
    }

    const key = phoneticKey(name);
    if (!key) {
      continue;
    }

    const existing = groups.get(key);
    if (existing) {
      existing.resources.push(resource);
    } else {
      groups.set(key, { displayName: name, resources: [resource] });
    }
  }

  return Array.from(groups.entries())
    .filter(([, group]) => group.resources.length >= 2)
    .sort((a, b) => b[1].resources.length - a[1].resources.length)
    .map(([key, group]) => ({
      phoneticKey: key,
      displayName: group.displayName,
      resources: group.resources,
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test src/pages/MergeDuplicates/duplicateDetection.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MergeDuplicates/duplicateDetection.ts src/pages/MergeDuplicates/duplicateDetection.test.ts
git commit -m "feat(merge): add duplicate detection with Double Metaphone phonetic matching"
```

---

### Task 3: Generalized reference rewriter

**Files:**
- Create: `src/pages/MergeDuplicates/rewriteReferences.ts`
- Create: `src/pages/MergeDuplicates/rewriteReferences.test.ts`

- [ ] **Step 1: Write failing tests for reference rewriting**

Create `src/pages/MergeDuplicates/rewriteReferences.test.ts`:

```typescript
// ABOUTME: Tests for the generalized FHIR reference rewriter.
// ABOUTME: Verifies deep-walk replacement of reference fields for any resource type.
import { describe, expect, it } from 'vitest';
import type { Encounter, Observation } from '@medplum/fhirtypes';
import { rewriteReferences } from './rewriteReferences';

describe('rewriteReferences', () => {
  it('rewrites a top-level participant reference', () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'finished',
      class: { code: 'AMB' },
      participant: [
        {
          individual: { reference: 'Practitioner/old-id' },
        },
      ],
    };
    const result = rewriteReferences(encounter, ['old-id'], 'keep-id', 'Practitioner');
    expect((result as Encounter).participant?.[0]?.individual?.reference).toBe(
      'Practitioner/keep-id'
    );
  });

  it('rewrites nested references in arrays', () => {
    const obs: Observation = {
      resourceType: 'Observation',
      id: 'obs-1',
      status: 'final',
      code: { text: 'test' },
      performer: [{ reference: 'Practitioner/dup-1' }, { reference: 'Practitioner/other' }],
    };
    const result = rewriteReferences(obs, ['dup-1'], 'keep-id', 'Practitioner');
    const performers = (result as Observation).performer!;
    expect(performers[0]?.reference).toBe('Practitioner/keep-id');
    expect(performers[1]?.reference).toBe('Practitioner/other');
  });

  it('returns null when no references match', () => {
    const obs: Observation = {
      resourceType: 'Observation',
      id: 'obs-1',
      status: 'final',
      code: { text: 'test' },
      performer: [{ reference: 'Practitioner/no-match' }],
    };
    const result = rewriteReferences(obs, ['dup-1'], 'keep-id', 'Practitioner');
    expect(result).toBeNull();
  });

  it('does not mutate the original resource', () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'finished',
      class: { code: 'AMB' },
      participant: [
        {
          individual: { reference: 'Practitioner/old-id' },
        },
      ],
    };
    rewriteReferences(encounter, ['old-id'], 'keep-id', 'Practitioner');
    expect(encounter.participant![0]!.individual!.reference).toBe('Practitioner/old-id');
  });

  it('rewrites multiple source IDs to the same target', () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'finished',
      class: { code: 'AMB' },
      participant: [
        { individual: { reference: 'Practitioner/dup-1' } },
        { individual: { reference: 'Practitioner/dup-2' } },
      ],
    };
    const result = rewriteReferences(encounter, ['dup-1', 'dup-2'], 'keep-id', 'Practitioner');
    const participants = (result as Encounter).participant!;
    expect(participants[0]?.individual?.reference).toBe('Practitioner/keep-id');
    expect(participants[1]?.individual?.reference).toBe('Practitioner/keep-id');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test src/pages/MergeDuplicates/rewriteReferences.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement rewriteReferences.ts**

Create `src/pages/MergeDuplicates/rewriteReferences.ts`:

```typescript
// ABOUTME: Generalized FHIR reference rewriter for any resource type.
// ABOUTME: Deep-walks a resource JSON tree and replaces matching reference fields.
import type { Resource } from '@medplum/fhirtypes';

/**
 * Deep-walks a FHIR resource and replaces all references matching
 * `{resourceType}/{sourceId}` with `{resourceType}/{targetId}`.
 *
 * Returns the modified copy, or null if no references were changed.
 * Does not mutate the original resource.
 */
export function rewriteReferences(
  resource: Resource,
  sourceIds: string[],
  targetId: string,
  resourceType: string
): Resource | null {
  if (sourceIds.length === 0) {
    return null;
  }

  const targetRef = `${resourceType}/${targetId}`;
  const sourceRefs = new Set(sourceIds.map((id) => `${resourceType}/${id}`));

  const copy = JSON.parse(JSON.stringify(resource)) as Resource;
  const changed = walkAndReplace(copy, sourceRefs, targetRef);

  return changed ? copy : null;
}

function walkAndReplace(
  obj: unknown,
  sourceRefs: Set<string>,
  targetRef: string
): boolean {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return false;
  }

  if (Array.isArray(obj)) {
    let changed = false;
    for (const item of obj) {
      if (walkAndReplace(item, sourceRefs, targetRef)) {
        changed = true;
      }
    }
    return changed;
  }

  const record = obj as Record<string, unknown>;
  let changed = false;

  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === 'string' && key === 'reference') {
      if (sourceRefs.has(value)) {
        record[key] = targetRef;
        changed = true;
      }
    } else if (typeof value === 'object' && value !== null) {
      if (walkAndReplace(value, sourceRefs, targetRef)) {
        changed = true;
      }
    }
  }

  return changed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test src/pages/MergeDuplicates/rewriteReferences.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MergeDuplicates/rewriteReferences.ts src/pages/MergeDuplicates/rewriteReferences.test.ts
git commit -m "feat(merge): add generalized reference rewriter for any resource type"
```

---

### Task 4: Parent wizard page and routing

**Files:**
- Create: `src/pages/MergeDuplicates/MergeDuplicatesPage.tsx`
- Modify: `src/App.tsx:61-71`
- Modify: `src/Shell.tsx:1-9` (imports) and `src/Shell.tsx:152-167` (admin nav)

- [ ] **Step 1: Create the parent wizard component**

Create `src/pages/MergeDuplicates/MergeDuplicatesPage.tsx`:

```typescript
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
```

- [ ] **Step 2: Add route to App.tsx**

In `src/App.tsx`, add the import at the top with the other page imports (after line 17):

```typescript
import { MergeDuplicatesPage } from './pages/MergeDuplicates/MergeDuplicatesPage';
```

Add the route inside the FhirProvider/Shell route group (after line 70, the delete-patient-resources route):

```typescript
        <Route path="/merge-duplicates" element={<MergeDuplicatesPage />} />
```

- [ ] **Step 3: Add admin nav link in Shell.tsx**

In `src/Shell.tsx`, add `IconGitMerge` to the icon imports (line 9):

```typescript
import { IconChevronDown, IconClipboard, IconFilter, IconGitMerge, IconList, IconSearch, IconSettings, IconTrash, IconUpload } from '@tabler/icons-react';
```

Add the nav link after the Delete Patient Resources nav link (after line 166):

```typescript
          <NavLink
            component={Link}
            to="/merge-duplicates"
            label="Merge Duplicates"
            leftSection={<IconGitMerge size={16} />}
            active={activeResourceType === 'merge-duplicates'}
          />
```

- [ ] **Step 4: Verify the app compiles**

```bash
bun run build
```

Expected: Compilation will fail because the step components don't exist yet. That's expected — we'll create stub versions to make it compile.

- [ ] **Step 5: Create stub step components**

Create each file with a minimal placeholder so the app compiles. These will be fully implemented in subsequent tasks.

`src/pages/MergeDuplicates/SelectResourceTypeStep.tsx`:
```typescript
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
```

`src/pages/MergeDuplicates/DuplicateGroupsStep.tsx`:
```typescript
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
```

`src/pages/MergeDuplicates/SelectPrimaryStep.tsx`:
```typescript
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
```

`src/pages/MergeDuplicates/PreviewStep.tsx`:
```typescript
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
```

`src/pages/MergeDuplicates/ExecutionStep.tsx`:
```typescript
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
```

`src/pages/MergeDuplicates/ResultsStep.tsx`:
```typescript
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
```

- [ ] **Step 6: Verify the app compiles**

```bash
bun run build
```

Expected: PASS — the app should compile with all stub components in place.

- [ ] **Step 7: Commit**

```bash
git add src/pages/MergeDuplicates/MergeDuplicatesPage.tsx src/pages/MergeDuplicates/SelectResourceTypeStep.tsx src/pages/MergeDuplicates/DuplicateGroupsStep.tsx src/pages/MergeDuplicates/SelectPrimaryStep.tsx src/pages/MergeDuplicates/PreviewStep.tsx src/pages/MergeDuplicates/ExecutionStep.tsx src/pages/MergeDuplicates/ResultsStep.tsx src/App.tsx src/Shell.tsx
git commit -m "feat(merge): add wizard page skeleton, routing, and admin nav link"
```

---

### Task 5: SelectResourceTypeStep — resource type dropdown and scan

**Files:**
- Modify: `src/pages/MergeDuplicates/SelectResourceTypeStep.tsx`

- [ ] **Step 1: Implement SelectResourceTypeStep**

Replace the stub in `src/pages/MergeDuplicates/SelectResourceTypeStep.tsx`:

```typescript
// ABOUTME: Step 1 of merge duplicates — select resource type and scan for duplicates.
// ABOUTME: Dropdown filtered to resource types with name fields, triggers duplicate detection.
import { Alert, Button, Group, Loader, Select, Stack, Text } from '@mantine/core';
import type { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { MERGEABLE_RESOURCE_TYPES } from '../../constants';
import { safeErrorMessage } from '../../errors';
import type { DuplicateGroup } from './duplicateDetection';
import { groupByPhoneticCode } from './duplicateDetection';

interface Props {
  readonly onScanComplete: (resourceType: string, groups: DuplicateGroup[]) => void;
}

export function SelectResourceTypeStep({ onScanComplete }: Props): JSX.Element {
  const medplum = useMedplum();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string>();

  const handleScan = async (): Promise<void> => {
    if (!selectedType) {
      return;
    }

    setScanning(true);
    setError(undefined);

    try {
      const allResources: Resource[] = [];
      let cursor: string | undefined;

      // Paginate through all resources of this type
      do {
        const params: Record<string, string> = { _count: '100' };
        if (cursor) {
          params._cursor = cursor;
        }

        const bundle: Bundle = await medplum.search(selectedType as ResourceType, params);

        for (const entry of bundle.entry ?? []) {
          if (entry.resource) {
            allResources.push(entry.resource);
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

      const groups = groupByPhoneticCode(allResources);
      onScanComplete(selectedType, groups);
    } catch (err) {
      setError(err instanceof Error ? safeErrorMessage(err) : String(err));
    } finally {
      setScanning(false);
    }
  };

  return (
    <Stack gap="md">
      <Text c="dimmed">Select a resource type to scan for potential duplicates using phonetic name matching.</Text>

      <Select
        label="Resource Type"
        placeholder="Select resource type"
        data={MERGEABLE_RESOURCE_TYPES.map((t) => ({ value: t, label: t }))}
        value={selectedType}
        onChange={setSelectedType}
        disabled={scanning}
      />

      {error && <Alert color="red" title="Scan failed">{error}</Alert>}

      <Group>
        <Button onClick={handleScan} disabled={!selectedType || scanning} loading={scanning}>
          {scanning ? 'Scanning...' : 'Scan for Duplicates'}
        </Button>
        {scanning && <Loader size="sm" />}
      </Group>
    </Stack>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MergeDuplicates/SelectResourceTypeStep.tsx
git commit -m "feat(merge): implement resource type selection and duplicate scan step"
```

---

### Task 6: DuplicateGroupsStep — display phonetic match groups

**Files:**
- Modify: `src/pages/MergeDuplicates/DuplicateGroupsStep.tsx`

- [ ] **Step 1: Implement DuplicateGroupsStep**

Replace the stub in `src/pages/MergeDuplicates/DuplicateGroupsStep.tsx`:

```typescript
// ABOUTME: Step 2 of merge duplicates — displays groups of phonetically similar resources.
// ABOUTME: Shows clickable group cards sorted by size, with resource count badges.
import { Alert, Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { DuplicateGroup } from './duplicateDetection';

interface Props {
  readonly resourceType: string;
  readonly groups: DuplicateGroup[];
  readonly onSelectGroup: (group: DuplicateGroup) => void;
  readonly onBack: () => void;
}

export function DuplicateGroupsStep({ resourceType, groups, onSelectGroup, onBack }: Props): JSX.Element {
  if (groups.length === 0) {
    return (
      <Stack gap="md">
        <Alert color="blue" title="No duplicates found">
          No potential duplicates were found for {resourceType}. Try a different resource type.
        </Alert>
        <Group>
          <Button variant="default" onClick={onBack}>← Back</Button>
        </Group>
      </Stack>
    );
  }

  const totalResources = groups.reduce((sum, g) => sum + g.resources.length, 0);

  return (
    <Stack gap="md">
      <Text c="dimmed">
        Found <Text span fw={700}>{groups.length} group{groups.length === 1 ? '' : 's'}</Text> of
        potential duplicates across {totalResources} {resourceType} resources.
      </Text>

      {groups.map((group) => (
        <Card
          key={group.phoneticKey}
          withBorder
          padding="md"
          style={{ cursor: 'pointer' }}
          onClick={() => onSelectGroup(group)}
        >
          <Group justify="space-between">
            <Group gap="sm">
              <Text fw={600}>{group.displayName}</Text>
              <Badge size="sm" variant="light">{group.resources.length} resources</Badge>
            </Group>
            <Text c="dimmed">→</Text>
          </Group>
        </Card>
      ))}

      <Group>
        <Button variant="default" onClick={onBack}>← Back</Button>
      </Group>
    </Stack>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MergeDuplicates/DuplicateGroupsStep.tsx
git commit -m "feat(merge): implement duplicate groups display step"
```

---

### Task 7: SelectPrimaryStep — pick which resource to keep

**Files:**
- Modify: `src/pages/MergeDuplicates/SelectPrimaryStep.tsx`

- [ ] **Step 1: Implement SelectPrimaryStep**

Replace the stub in `src/pages/MergeDuplicates/SelectPrimaryStep.tsx`:

```typescript
// ABOUTME: Step 3 of merge duplicates — pick which resource to keep from a duplicate group.
// ABOUTME: Shows side-by-side resource details with click-to-select primary.
import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import type { DuplicateGroup } from './duplicateDetection';
import { extractDisplayName } from './duplicateDetection';

interface Props {
  readonly resourceType: string;
  readonly group: DuplicateGroup;
  readonly onConfirm: (primary: Resource) => void;
  readonly onBack: () => void;
}

interface NamedResource extends Resource {
  readonly identifier?: ReadonlyArray<{ readonly system?: string; readonly value?: string }>;
  readonly telecom?: ReadonlyArray<{ readonly system?: string; readonly value?: string }>;
  readonly meta?: { readonly lastUpdated?: string };
}

export function SelectPrimaryStep({ resourceType, group, onConfirm, onBack }: Props): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedResource = group.resources.find((r) => r.id === selectedId);

  return (
    <Stack gap="md">
      <Text c="dimmed">
        Select the {resourceType} to <Text span fw={700}>keep</Text>. The others will be deleted and their references redirected.
      </Text>

      {group.resources.map((resource) => {
        const named = resource as NamedResource;
        const isSelected = resource.id === selectedId;
        const identifier = named.identifier?.[0];
        const phone = named.telecom?.find((t) => t.system === 'phone');
        const email = named.telecom?.find((t) => t.system === 'email');

        return (
          <Card
            key={resource.id}
            withBorder
            padding="md"
            style={{
              cursor: 'pointer',
              borderColor: isSelected ? 'var(--mantine-color-blue-6)' : undefined,
              borderWidth: isSelected ? 2 : undefined,
              opacity: selectedId && !isSelected ? 0.7 : 1,
            }}
            onClick={() => setSelectedId(resource.id ?? null)}
          >
            <Group justify="space-between">
              <Group gap="sm">
                <Text fw={600}>{extractDisplayName(resource)}</Text>
                <Text size="sm" c="dimmed">ID: {resource.id}</Text>
              </Group>
              {isSelected ? (
                <Badge color="blue" variant="filled">✓ Keep</Badge>
              ) : selectedId ? (
                <Badge color="red" variant="light">✗ Delete</Badge>
              ) : null}
            </Group>
            <Text size="sm" c="dimmed" mt="xs">
              {identifier ? `${identifier.system ?? 'ID'}: ${identifier.value}` : 'No identifier'}
              {phone ? ` · Phone: ${phone.value}` : ''}
              {email ? ` · Email: ${email.value}` : ''}
              {named.meta?.lastUpdated ? ` · Updated: ${named.meta.lastUpdated.slice(0, 10)}` : ''}
            </Text>
          </Card>
        );
      })}

      <Group>
        <Button variant="default" onClick={onBack}>← Back</Button>
        <Button
          disabled={!selectedResource}
          onClick={() => selectedResource && onConfirm(selectedResource)}
        >
          Preview Impact →
        </Button>
      </Group>
    </Stack>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MergeDuplicates/SelectPrimaryStep.tsx
git commit -m "feat(merge): implement primary resource selection step"
```

---

### Task 8: PreviewStep — reference impact and confirmation

**Files:**
- Modify: `src/pages/MergeDuplicates/PreviewStep.tsx`

- [ ] **Step 1: Implement PreviewStep**

Replace the stub in `src/pages/MergeDuplicates/PreviewStep.tsx`:

```typescript
// ABOUTME: Step 4 of merge duplicates — shows reference impact and confirmation.
// ABOUTME: Displays count of references to rewrite per resource type before executing merge.
import { Alert, Button, Group, Loader, Stack, Table, Text } from '@mantine/core';
import type { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { RESOURCE_TYPES } from '../../constants';
import { safeErrorMessage } from '../../errors';
import type { DuplicateGroup } from './duplicateDetection';
import { extractDisplayName } from './duplicateDetection';

interface Props {
  readonly resourceType: string;
  readonly group: DuplicateGroup;
  readonly primaryResource: Resource;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

interface ReferenceImpact {
  readonly resourceType: string;
  readonly count: number;
}

export function PreviewStep({ resourceType, group, primaryResource, onConfirm, onBack }: Props): JSX.Element {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [impacts, setImpacts] = useState<ReferenceImpact[]>([]);

  const duplicates = group.resources.filter((r) => r.id !== primaryResource.id);

  useEffect(() => {
    let cancelled = false;

    async function countReferences(): Promise<void> {
      setLoading(true);
      setError(undefined);

      try {
        const impactMap = new Map<string, number>();

        for (const duplicate of duplicates) {
          const refString = `${resourceType}/${duplicate.id}`;

          for (const searchType of RESOURCE_TYPES) {
            try {
              const bundle: Bundle = await medplum.search(searchType as ResourceType, {
                _content: refString,
                _count: '0',
                _total: 'accurate',
              });
              const count = bundle.total ?? 0;
              if (count > 0) {
                impactMap.set(searchType, (impactMap.get(searchType) ?? 0) + count);
              }
            } catch {
              // Skip resource types that fail (e.g., unsupported search params)
            }
          }
        }

        if (!cancelled) {
          setImpacts(
            Array.from(impactMap.entries())
              .map(([rt, count]) => ({ resourceType: rt, count }))
              .sort((a, b) => b.count - a.count)
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? safeErrorMessage(err) : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    countReferences();
    return () => { cancelled = true; };
  }, [medplum, resourceType, duplicates]);

  const totalReferences = impacts.reduce((sum, i) => sum + i.count, 0);

  if (loading) {
    return (
      <Stack gap="md" align="center">
        <Loader size="md" />
        <Text c="dimmed">Scanning for references to update...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap="md">
        <Alert color="red" title="Failed to scan references">{error}</Alert>
        <Group>
          <Button variant="default" onClick={onBack}>← Back</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text><Text span fw={700}>Merging into:</Text> {extractDisplayName(primaryResource)} ({primaryResource.id})</Text>
      <Text><Text span fw={700}>Deleting:</Text> {duplicates.length} duplicate resource{duplicates.length === 1 ? '' : 's'}</Text>

      {impacts.length > 0 ? (
        <>
          <Text fw={700}>References to update:</Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Resource Type</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>References</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {impacts.map((impact) => (
                <Table.Tr key={impact.resourceType}>
                  <Table.Td>{impact.resourceType}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{impact.count}</Table.Td>
                </Table.Tr>
              ))}
              <Table.Tr>
                <Table.Td fw={700}>Total</Table.Td>
                <Table.Td fw={700} style={{ textAlign: 'right' }}>{totalReferences}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </>
      ) : (
        <Text c="dimmed">No references found to update. The duplicates will be deleted directly.</Text>
      )}

      <Group>
        <Button variant="default" onClick={onBack}>← Back</Button>
        <Button color="red" onClick={onConfirm}>
          Merge & Delete Duplicates
        </Button>
      </Group>
    </Stack>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MergeDuplicates/PreviewStep.tsx
git commit -m "feat(merge): implement reference impact preview and confirmation step"
```

---

### Task 9: ExecutionStep — merge with progress tracking

**Files:**
- Modify: `src/pages/MergeDuplicates/ExecutionStep.tsx`

- [ ] **Step 1: Implement ExecutionStep**

Replace the stub in `src/pages/MergeDuplicates/ExecutionStep.tsx`:

```typescript
// ABOUTME: Step 5 of merge duplicates — executes the merge with progress tracking.
// ABOUTME: Rewrites references, deletes duplicates, creates AuditEvent, shows progress bar.
import { Alert, Progress, Stack, Text } from '@mantine/core';
import type { AuditEvent, Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
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

  const duplicates = group.resources.filter((r) => r.id !== primaryResource.id);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    async function execute(): Promise<void> {
      let totalReferencesUpdated = 0;
      const affectedTypes = new Set<string>();

      try {
        // Phase 1: Rewrite references for each duplicate
        for (const duplicate of duplicates) {
          setCurrentPhase(`Rewriting references for ${duplicate.id}...`);
          const refString = `${resourceType}/${duplicate.id}`;

          for (const searchType of RESOURCE_TYPES) {
            setProgress((prev) => [
              ...prev.filter((p) => p.resourceType !== searchType),
              { resourceType: searchType, status: 'pending', count: 0 },
            ]);

            try {
              // Search for resources referencing this duplicate
              const bundle: Bundle = await medplum.search(searchType as ResourceType, {
                _content: refString,
                _count: '100',
              });

              const resources = (bundle.entry ?? [])
                .map((e) => e.resource)
                .filter((r): r is Resource => r !== undefined);

              let updatedCount = 0;
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

          // Phase 2: Delete the duplicate
          setCurrentPhase(`Deleting duplicate ${duplicate.id}...`);
          await medplum.deleteResource(resourceType as ResourceType, duplicate.id!);
        }

        // Phase 3: Create AuditEvent
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
  }, [medplum, resourceType, duplicates, primaryResource, onComplete]);

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
```

- [ ] **Step 2: Verify the app compiles**

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MergeDuplicates/ExecutionStep.tsx
git commit -m "feat(merge): implement execution step with progress tracking and AuditEvent"
```

---

### Task 10: ResultsStep — summary of completed merge

**Files:**
- Modify: `src/pages/MergeDuplicates/ResultsStep.tsx`

- [ ] **Step 1: Implement ResultsStep**

Replace the stub in `src/pages/MergeDuplicates/ResultsStep.tsx`:

```typescript
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
```

- [ ] **Step 2: Verify the app compiles**

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MergeDuplicates/ResultsStep.tsx
git commit -m "feat(merge): implement results summary step"
```

---

### Task 11: Integration tests for the wizard flow

**Files:**
- Create: `src/pages/MergeDuplicates/MergeDuplicatesPage.test.tsx`

- [ ] **Step 1: Write integration tests**

Create `src/pages/MergeDuplicates/MergeDuplicatesPage.test.tsx`:

```typescript
// ABOUTME: Integration tests for the merge duplicates wizard flow.
// ABOUTME: Verifies the multi-step flow from type selection through to results.
import { MantineProvider } from '@mantine/core';
import type { Bundle, ResourceType } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../../fhir/medplum-adapter';
import { MergeDuplicatesPage } from './MergeDuplicatesPage';

function renderPage(
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({});
  medplumOverrides?.(medplum);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/merge-duplicates']}>
          <MergeDuplicatesPage />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

describe('MergeDuplicatesPage', () => {
  it('renders the select resource type step initially', () => {
    renderPage();
    expect(screen.getByText('Merge Duplicates')).toBeDefined();
    expect(screen.getByText('Select resource type')).toBeDefined();
  });

  it('shows duplicate groups after scanning', async () => {
    const user = userEvent.setup();

    renderPage((medplum) => {
      vi.spyOn(medplum, 'search').mockImplementation(
        (_type: ResourceType) => {
          return Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
              {
                resource: {
                  resourceType: 'Practitioner',
                  id: 'p1',
                  name: [{ family: 'Smith', given: ['John'] }],
                },
              },
              {
                resource: {
                  resourceType: 'Practitioner',
                  id: 'p2',
                  name: [{ family: 'Smyth', given: ['Jon'] }],
                },
              },
            ],
          } as Bundle);
        }
      );
    });

    // Open the select dropdown and pick Practitioner
    const selectInput = screen.getByText('Select resource type');
    await user.click(selectInput);
    const practitionerOption = await screen.findByText('Practitioner');
    await user.click(practitionerOption);

    // Click scan
    const scanButton = screen.getByText('Scan for Duplicates');
    await user.click(scanButton);

    // Should show the groups step
    await waitFor(() => {
      expect(screen.getByText(/group/i)).toBeDefined();
    });
  });

  it('shows no duplicates message when none found', async () => {
    const user = userEvent.setup();

    renderPage((medplum) => {
      vi.spyOn(medplum, 'search').mockImplementation(
        () => {
          return Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
              {
                resource: {
                  resourceType: 'Practitioner',
                  id: 'p1',
                  name: [{ family: 'Smith', given: ['John'] }],
                },
              },
              {
                resource: {
                  resourceType: 'Practitioner',
                  id: 'p2',
                  name: [{ family: 'Jones', given: ['Alice'] }],
                },
              },
            ],
          } as Bundle);
        }
      );
    });

    const selectInput = screen.getByText('Select resource type');
    await user.click(selectInput);
    const practitionerOption = await screen.findByText('Practitioner');
    await user.click(practitionerOption);

    const scanButton = screen.getByText('Scan for Duplicates');
    await user.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText('No duplicates found')).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run the integration tests**

```bash
bun run test src/pages/MergeDuplicates/MergeDuplicatesPage.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 3: Run the full test suite**

```bash
bun run test
```

Expected: All tests PASS including existing tests.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MergeDuplicates/MergeDuplicatesPage.test.tsx
git commit -m "test(merge): add integration tests for merge duplicates wizard flow"
```

---

### Task 12: Final build verification and cleanup

- [ ] **Step 1: Run the full build**

```bash
bun run build
```

Expected: PASS — no TypeScript errors.

- [ ] **Step 2: Run all tests**

```bash
bun run test
```

Expected: All tests PASS.

- [ ] **Step 3: Verify the page is accessible**

```bash
bun run dev
```

Open `http://localhost:5173/merge-duplicates` in the browser. Verify:
- The page renders with the "Merge Duplicates" title
- The resource type dropdown shows Patient, Practitioner, RelatedPerson, Organization
- The "Merge Duplicates" link appears under Admin in the sidebar

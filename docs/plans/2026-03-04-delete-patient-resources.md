# Delete Patient Resources — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an admin page that lets users select a patient, see resource counts by type, choose which types to delete, and execute bulk deletions with progress tracking.

**Architecture:** Multi-step page component (select → preview → confirm → progress → results) following the BulkLoadPage pattern. All FHIR operations go through the existing MedplumClient proxy. Patient-to-resource lookups use a per-type search parameter mapping.

**Tech Stack:** React 19, Mantine 8, @medplum/react-hooks, @medplum/fhirtypes, Vitest + Testing Library

---

### Task 1: Create the page with patient search (Step 1 UI)

**Files:**
- Create: `src/pages/DeletePatientResourcesPage.tsx`
- Test: `src/pages/DeletePatientResourcesPage.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/pages/DeletePatientResourcesPage.test.tsx
// ABOUTME: Tests for the delete patient resources admin page.
// ABOUTME: Verifies multi-step flow: patient selection, resource counting, deletion progress.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { DeletePatientResourcesPage } from './DeletePatientResourcesPage';

function renderPage(
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => undefined });
  medplumOverrides?.(medplum);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/delete-patient-resources']}>
          <DeletePatientResourcesPage />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

describe('DeletePatientResourcesPage', () => {
  it('renders the select patient step initially', () => {
    renderPage();
    expect(screen.getByText('Delete Patient Resources')).toBeDefined();
    expect(screen.getByPlaceholderText('Search by name...')).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- src/pages/DeletePatientResourcesPage.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the initial component with patient search**

The patient search combobox follows the exact pattern from `BulkLoadPage.tsx:103-136` (debounced search, Combobox, TextInput).

```tsx
// src/pages/DeletePatientResourcesPage.tsx
// ABOUTME: Admin page for deleting FHIR resources associated with a patient.
// ABOUTME: Multi-step flow: select patient, preview resource counts, confirm, delete with progress.
import {
  Badge,
  Card,
  Combobox,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
  useCombobox,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';

type Step = 'select' | 'preview' | 'confirm' | 'progress' | 'results';

export function DeletePatientResourcesPage(): JSX.Element {
  const medplum = useMedplum();

  const [step, setStep] = useState<Step>('select');
  const [patient, setPatient] = useState<Patient>();
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const combobox = useCombobox();

  const searchPatients = useDebouncedCallback(async (query: string) => {
    if (!query.trim()) {
      setPatientResults([]);
      setSearchingPatients(false);
      return;
    }
    setSearchingPatients(true);
    try {
      const bundle = await medplum.search('Patient', { name: query, _count: '10' });
      const patients: Patient[] = [];
      for (const e of bundle.entry ?? []) {
        if (e.resource) {
          patients.push(e.resource);
        }
      }
      setPatientResults(patients);
    } catch {
      setPatientResults([]);
    } finally {
      setSearchingPatients(false);
    }
  }, 300);

  const handlePatientQueryChange = (value: string): void => {
    setPatientQuery(value);
    searchPatients(value);
    if (patient && value !== getDisplayString(patient)) {
      setPatient(undefined);
    }
    combobox.openDropdown();
  };

  const handleSelectPatient = (patientId: string): void => {
    const selected = patientResults.find((p) => p.id === patientId);
    if (selected) {
      setPatient(selected);
      setPatientQuery(getDisplayString(selected));
    }
    combobox.closeDropdown();
  };

  return (
    <Stack>
      <Group>
        <IconTrash size={24} />
        <Title order={3}>Delete Patient Resources</Title>
      </Group>

      {step === 'select' && (
        <Card withBorder>
          <Stack>
            <Text>
              Search for a patient, then review and delete their associated resources.
              This is intended for maintaining demo accounts.
            </Text>

            <Combobox store={combobox} onOptionSubmit={handleSelectPatient}>
              <Combobox.Target>
                <TextInput
                  label="Patient"
                  placeholder="Search by name..."
                  value={patientQuery}
                  onChange={(e) => handlePatientQueryChange(e.currentTarget.value)}
                  onFocus={() => combobox.openDropdown()}
                  onBlur={() => combobox.closeDropdown()}
                  rightSection={searchingPatients ? <Loader size={16} /> : null}
                />
              </Combobox.Target>
              <Combobox.Dropdown>
                <Combobox.Options>
                  {patientResults.length > 0 ? (
                    patientResults.map((p) => (
                      <Combobox.Option key={p.id} value={p.id ?? ''}>
                        <Text size="sm">{getDisplayString(p)}</Text>
                        <Text size="xs" c="dimmed">Patient/{p.id}</Text>
                      </Combobox.Option>
                    ))
                  ) : patientQuery.trim() ? (
                    <Combobox.Empty>No patients found</Combobox.Empty>
                  ) : null}
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>

            {patient && (
              <Group>
                <Text size="sm">Selected:</Text>
                <Badge>{getDisplayString(patient)} (Patient/{patient.id})</Badge>
              </Group>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
```

Note: `step` and `setStep` will be used in subsequent tasks. The linter may warn about unused vars — that's fine, they'll be wired up in Task 2.

**Step 4: Run test to verify it passes**

Run: `bun run test -- src/pages/DeletePatientResourcesPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/DeletePatientResourcesPage.tsx src/pages/DeletePatientResourcesPage.test.tsx
git commit -m "feat: add DeletePatientResourcesPage with patient search (step 1)"
```

---

### Task 2: Add resource counting and preview step (Step 2 UI)

**Files:**
- Modify: `src/pages/DeletePatientResourcesPage.tsx`
- Modify: `src/pages/DeletePatientResourcesPage.test.tsx`

**Step 1: Write the failing test**

Add to the test file:

```tsx
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

// Add this test to the describe block:
it('loads resource counts after selecting a patient', async () => {
  const searchSpy = vi.fn()
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{
        resource: {
          resourceType: 'Patient',
          id: 'patient-1',
          name: [{ given: ['Jane'], family: 'Doe' }],
        },
      }],
    })
    // Count responses for each resource type — return 3 for Observation, 0 for the rest
    .mockImplementation(async (type: string, params: Record<string, string>) => {
      if (params._summary === 'count') {
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          total: type === 'Observation' ? 3 : 0,
        };
      }
      return { resourceType: 'Bundle', type: 'searchset', entry: [] };
    });

  renderPage((medplum) => {
    vi.spyOn(medplum, 'search').mockImplementation(searchSpy);
  });

  const user = userEvent.setup();
  const input = screen.getByPlaceholderText('Search by name...');
  await user.type(input, 'Jane');

  const option = await screen.findByText('Patient/patient-1');
  await user.click(option);

  // Should transition to preview and show counts
  expect(await screen.findByText('Observation')).toBeDefined();
  expect(await screen.findByText('3')).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- src/pages/DeletePatientResourcesPage.test.tsx`
Expected: FAIL — preview step not rendered

**Step 3: Implement resource counting and preview UI**

Add to `DeletePatientResourcesPage.tsx`:

1. Define the patient search parameter mapping (place above the component function):

```tsx
/** Maps FHIR resource types to the search parameter that references a Patient. */
const PATIENT_RESOURCE_TYPES: ReadonlyArray<{ readonly type: string; readonly param: string }> = [
  { type: 'Observation', param: 'subject' },
  { type: 'Condition', param: 'subject' },
  { type: 'Encounter', param: 'subject' },
  { type: 'MedicationRequest', param: 'subject' },
  { type: 'DiagnosticReport', param: 'subject' },
  { type: 'Procedure', param: 'subject' },
  { type: 'CarePlan', param: 'subject' },
  { type: 'CareTeam', param: 'subject' },
  { type: 'DocumentReference', param: 'subject' },
  { type: 'Goal', param: 'subject' },
  { type: 'ServiceRequest', param: 'subject' },
  { type: 'Specimen', param: 'subject' },
  { type: 'AllergyIntolerance', param: 'patient' },
  { type: 'Immunization', param: 'patient' },
  { type: 'Claim', param: 'patient' },
  { type: 'RelatedPerson', param: 'patient' },
  { type: 'Coverage', param: 'beneficiary' },
];
```

2. Add state for counts and loading:

```tsx
const [counts, setCounts] = useState<Record<string, number>>({});
const [loadingCounts, setLoadingCounts] = useState(false);
const [countError, setCountError] = useState<string>();
const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
```

3. Add a `loadCounts` function that runs after patient selection:

```tsx
import { useCallback } from 'react';
import type { ResourceType } from '@medplum/fhirtypes';
import { safeErrorMessage } from '../errors';

const loadCounts = useCallback(async (patientId: string) => {
  setLoadingCounts(true);
  setCountError(undefined);
  setCounts({});
  setSelectedTypes(new Set());

  try {
    const results = await Promise.allSettled(
      PATIENT_RESOURCE_TYPES.map(async ({ type, param }) => {
        const bundle = await medplum.search(type as ResourceType, {
          [param]: `Patient/${patientId}`,
          _summary: 'count',
        });
        return { type, count: bundle.total ?? 0 };
      })
    );

    const newCounts: Record<string, number> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        newCounts[result.value.type] = result.value.count;
      }
    }
    setCounts(newCounts);
    setStep('preview');
  } catch (err: unknown) {
    setCountError(err instanceof Error ? safeErrorMessage(err) : String(err));
  } finally {
    setLoadingCounts(false);
  }
}, [medplum]);
```

4. Wire patient selection to trigger count loading — update `handleSelectPatient`:

```tsx
const handleSelectPatient = (patientId: string): void => {
  const selected = patientResults.find((p) => p.id === patientId);
  if (selected) {
    setPatient(selected);
    setPatientQuery(getDisplayString(selected));
    void loadCounts(selected.id!);
  }
  combobox.closeDropdown();
};
```

5. Add preview step UI (after the `step === 'select'` block):

```tsx
import { Alert, Button, Checkbox, Table } from '@mantine/core';

{step === 'preview' && patient && (
  <Card withBorder>
    <Stack>
      <Group>
        <Text size="sm">Patient:</Text>
        <Badge>{getDisplayString(patient)} (Patient/{patient.id})</Badge>
      </Group>

      {loadingCounts ? (
        <Group><Loader size="sm" /><Text size="sm">Loading resource counts...</Text></Group>
      ) : countError ? (
        <Alert color="red">{countError}</Alert>
      ) : (
        <>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  <Checkbox
                    checked={selectedTypes.size > 0 && selectedTypes.size === Object.entries(counts).filter(([, c]) => c > 0).length}
                    indeterminate={selectedTypes.size > 0 && selectedTypes.size < Object.entries(counts).filter(([, c]) => c > 0).length}
                    onChange={(e) => {
                      if (e.currentTarget.checked) {
                        setSelectedTypes(new Set(Object.entries(counts).filter(([, c]) => c > 0).map(([t]) => t)));
                      } else {
                        setSelectedTypes(new Set());
                      }
                    }}
                  />
                </Table.Th>
                <Table.Th>Resource Type</Table.Th>
                <Table.Th>Count</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {PATIENT_RESOURCE_TYPES.map(({ type }) => {
                const count = counts[type] ?? 0;
                return (
                  <Table.Tr key={type} style={count === 0 ? { opacity: 0.4 } : undefined}>
                    <Table.Td>
                      <Checkbox
                        checked={selectedTypes.has(type)}
                        disabled={count === 0}
                        onChange={(e) => {
                          setSelectedTypes((prev) => {
                            const next = new Set(prev);
                            if (e.currentTarget.checked) {
                              next.add(type);
                            } else {
                              next.delete(type);
                            }
                            return next;
                          });
                        }}
                      />
                    </Table.Td>
                    <Table.Td>{type}</Table.Td>
                    <Table.Td>{count}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          <Group>
            <Button variant="default" onClick={() => { setStep('select'); setPatient(undefined); setPatientQuery(''); }}>
              Back
            </Button>
            <Button color="red" disabled={selectedTypes.size === 0}>
              Delete Selected
            </Button>
          </Group>
        </>
      )}
    </Stack>
  </Card>
)}
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- src/pages/DeletePatientResourcesPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/DeletePatientResourcesPage.tsx src/pages/DeletePatientResourcesPage.test.tsx
git commit -m "feat: add resource counting and preview step with checkboxes"
```

---

### Task 3: Add confirmation modal and deletion logic (Steps 3-4)

**Files:**
- Modify: `src/pages/DeletePatientResourcesPage.tsx`
- Modify: `src/pages/DeletePatientResourcesPage.test.tsx`

**Step 1: Write the failing test**

```tsx
it('deletes selected resource types after confirmation', async () => {
  const deleteSpy = vi.fn().mockResolvedValue(undefined);
  const searchSpy = vi.fn()
    // First call: patient search
    .mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{
        resource: {
          resourceType: 'Patient',
          id: 'patient-1',
          name: [{ given: ['Jane'], family: 'Doe' }],
        },
      }],
    })
    // Count calls — return 2 for Observation, 0 for rest
    .mockImplementation(async (type: string, params: Record<string, string>) => {
      if (params._summary === 'count') {
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          total: type === 'Observation' ? 2 : 0,
        };
      }
      // Fetch IDs for deletion
      if (params._elements === 'id') {
        if (type === 'Observation') {
          return {
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
              { resource: { resourceType: 'Observation', id: 'obs-1' } },
              { resource: { resourceType: 'Observation', id: 'obs-2' } },
            ],
          };
        }
      }
      return { resourceType: 'Bundle', type: 'searchset', entry: [] };
    });

  renderPage((medplum) => {
    vi.spyOn(medplum, 'search').mockImplementation(searchSpy);
    vi.spyOn(medplum, 'deleteResource').mockImplementation(deleteSpy);
  });

  const user = userEvent.setup();

  // Select patient
  await user.type(screen.getByPlaceholderText('Search by name...'), 'Jane');
  await user.click(await screen.findByText('Patient/patient-1'));

  // Wait for preview, check Observation
  const observationCheckbox = await screen.findByRole('checkbox', { name: '' });
  // Find the Observation row checkbox — it should be the first enabled one
  const checkboxes = await screen.findAllByRole('checkbox');
  // Click the Observation checkbox (first non-header enabled checkbox)
  for (const cb of checkboxes) {
    if (!(cb as HTMLInputElement).disabled && !(cb as HTMLInputElement).checked) {
      await user.click(cb);
      break;
    }
  }

  // Click Delete Selected
  await user.click(screen.getByRole('button', { name: 'Delete Selected' }));

  // Confirm in modal
  await user.click(await screen.findByRole('button', { name: 'Confirm Delete' }));

  // Should show results
  expect(await screen.findByText(/deleted/i)).toBeDefined();
  expect(deleteSpy).toHaveBeenCalledTimes(2);
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- src/pages/DeletePatientResourcesPage.test.tsx`
Expected: FAIL — no confirmation modal or deletion logic

**Step 3: Implement confirmation modal and deletion**

Add to the component:

1. Add Modal import and state:

```tsx
import { Modal, Progress } from '@mantine/core';
import { useRef } from 'react';

const [confirmOpen, setConfirmOpen] = useState(false);
const [deleteResults, setDeleteResults] = useState<Array<{ type: string; success: boolean; error?: string }>>([]);
const [deleteIndex, setDeleteIndex] = useState(0);
const [deleteTotal, setDeleteTotal] = useState(0);
const [deleting, setDeleting] = useState(false);
const cancelRef = useRef(false);
```

2. Wire the "Delete Selected" button to open the modal:

```tsx
<Button color="red" disabled={selectedTypes.size === 0} onClick={() => setConfirmOpen(true)}>
  Delete Selected
</Button>
```

3. Add the confirmation modal (inside the component return, after the step blocks):

```tsx
<Modal
  opened={confirmOpen}
  onClose={() => setConfirmOpen(false)}
  title="Confirm Deletion"
>
  <Stack>
    <Text>
      Delete {Array.from(selectedTypes).reduce((sum, t) => sum + (counts[t] ?? 0), 0)} resources
      across {selectedTypes.size} type{selectedTypes.size === 1 ? '' : 's'} for
      patient {patient ? getDisplayString(patient) : ''}?
    </Text>
    <Text size="sm" c="dimmed">This action cannot be undone.</Text>
    <Group justify="flex-end">
      <Button variant="default" onClick={() => setConfirmOpen(false)}>Cancel</Button>
      <Button color="red" onClick={handleStartDelete}>Confirm Delete</Button>
    </Group>
  </Stack>
</Modal>
```

4. Implement the delete handler:

```tsx
const handleStartDelete = useCallback(async () => {
  if (!patient?.id) return;
  setConfirmOpen(false);
  setStep('progress');
  setDeleting(true);
  setDeleteResults([]);
  setDeleteIndex(0);
  cancelRef.current = false;

  // Collect all resource IDs to delete
  const toDelete: Array<{ type: string; id: string }> = [];

  for (const type of selectedTypes) {
    const config = PATIENT_RESOURCE_TYPES.find((r) => r.type === type);
    if (!config) continue;

    let nextPageUrl: string | undefined;
    do {
      if (cancelRef.current) break;
      const bundle = await medplum.search(type as ResourceType, {
        [config.param]: `Patient/${patient.id}`,
        _elements: 'id',
        _count: '100',
      });
      for (const entry of bundle.entry ?? []) {
        if (entry.resource?.id) {
          toDelete.push({ type, id: entry.resource.id });
        }
      }
      // Check for next page
      const nextLink = bundle.link?.find((l) => l.relation === 'next');
      nextPageUrl = nextLink?.url;
      // GCP pagination: for now we fetch one page per type since _summary=count gave us the total
      // and most demo accounts won't have >100 of one type
      break;
    } while (nextPageUrl);
  }

  setDeleteTotal(toDelete.length);

  const results: Array<{ type: string; success: boolean; error?: string }> = [];
  for (let i = 0; i < toDelete.length; i++) {
    if (cancelRef.current) break;
    const item = toDelete[i]!;
    setDeleteIndex(i + 1);
    try {
      await medplum.deleteResource(item.type as ResourceType, item.id);
      results.push({ type: item.type, success: true });
    } catch (err: unknown) {
      results.push({
        type: item.type,
        success: false,
        error: err instanceof Error ? safeErrorMessage(err) : String(err),
      });
    }
    setDeleteResults([...results]);
  }

  setDeleting(false);
  setStep('results');
}, [patient, selectedTypes, medplum]);
```

5. Add progress step UI:

```tsx
{step === 'progress' && (
  <Card withBorder>
    <Stack>
      <Title order={4}>Deleting Resources</Title>
      <Progress value={deleteTotal > 0 ? (deleteIndex / deleteTotal) * 100 : 0} animated={deleting} />
      <Text size="sm">{deleteIndex} / {deleteTotal} resources processed</Text>
      {deleting && (
        <Button variant="default" onClick={() => { cancelRef.current = true; }}>Cancel</Button>
      )}
    </Stack>
  </Card>
)}
```

6. Add results step UI:

```tsx
{step === 'results' && (
  <Card withBorder>
    <Stack>
      <Title order={4}>Results</Title>
      <Group>
        <Badge color="green" size="lg">{deleteResults.filter((r) => r.success).length} deleted</Badge>
        {deleteResults.filter((r) => !r.success).length > 0 && (
          <Badge color="red" size="lg">{deleteResults.filter((r) => !r.success).length} failed</Badge>
        )}
      </Group>

      {deleteResults.filter((r) => !r.success).length > 0 && (
        <Stack gap="xs">
          <Text fw={500}>Failures:</Text>
          {deleteResults.filter((r) => !r.success).map((r, i) => (
            <Alert key={i} color="red" variant="light">{r.type}/{r.error}</Alert>
          ))}
        </Stack>
      )}

      <Button variant="default" onClick={() => {
        setStep('select');
        setPatient(undefined);
        setPatientQuery('');
        setCounts({});
        setSelectedTypes(new Set());
        setDeleteResults([]);
        setDeleteIndex(0);
        setDeleteTotal(0);
      }}>
        Start Over
      </Button>
    </Stack>
  </Card>
)}
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- src/pages/DeletePatientResourcesPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/DeletePatientResourcesPage.tsx src/pages/DeletePatientResourcesPage.test.tsx
git commit -m "feat: add confirmation modal, deletion logic, progress and results steps"
```

---

### Task 4: Add route and navigation

**Files:**
- Modify: `src/App.tsx:59` — add route
- Modify: `src/Shell.tsx:147-155` — add nav link

**Step 1: Write the failing test (not needed — this is wiring only)**

This is purely additive routing config. Verify manually.

**Step 2: Add route in App.tsx**

After line 17 (BulkLoadPage import), add:

```tsx
import { DeletePatientResourcesPage } from './pages/DeletePatientResourcesPage';
```

After line 59 (the bulk-load route), add:

```tsx
<Route path="delete-patient-resources" element={<DeletePatientResourcesPage />} />
```

**Step 3: Add nav link in Shell.tsx**

After the existing Bulk Load NavLink (line 154), before the `</Collapse>`, add:

```tsx
<NavLink
  component={Link}
  to="/delete-patient-resources"
  label="Delete Patient Resources"
  leftSection={<IconTrash size={16} />}
  active={activeResourceType === 'delete-patient-resources'}
/>
```

Add `IconTrash` to the imports from `@tabler/icons-react` (line 9).

**Step 4: Run all tests to verify nothing breaks**

Run: `bun run test`
Expected: ALL PASS

**Step 5: Run the build to verify TypeScript is happy**

Run: `bun run build`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add src/App.tsx src/Shell.tsx
git commit -m "feat: add route and nav link for delete patient resources page"
```

---

### Task 5: Polish and handle pagination for large datasets

**Files:**
- Modify: `src/pages/DeletePatientResourcesPage.tsx`

**Step 1: Handle pagination in deletion**

The current implementation fetches only the first page of 100 resources. For demo accounts this is likely sufficient, but we should handle the case where there are more than 100 resources of one type. Update the delete handler to re-fetch after deleting a page (since we can't rely on cursor pagination with concurrent deletes):

Replace the `do...while` loop in `handleStartDelete` with a simpler approach — after deleting a batch, re-query to see if more exist:

```tsx
for (const type of selectedTypes) {
  if (cancelRef.current) break;
  const config = PATIENT_RESOURCE_TYPES.find((r) => r.type === type);
  if (!config) continue;

  // Fetch pages of IDs until none remain
  let hasMore = true;
  while (hasMore && !cancelRef.current) {
    const bundle = await medplum.search(type as ResourceType, {
      [config.param]: `Patient/${patient.id}`,
      _elements: 'id',
      _count: '100',
    });
    const entries = bundle.entry ?? [];
    if (entries.length === 0) {
      hasMore = false;
      break;
    }
    for (const entry of entries) {
      if (entry.resource?.id) {
        toDelete.push({ type, id: entry.resource.id });
      }
    }
    hasMore = false; // We'll process this batch, then re-query if needed
  }
}
```

Actually, a simpler approach: collect all IDs first (paginating), then delete. But since GCP cursor pagination is forward-only and resources are being deleted, the safest approach is the two-phase one already implemented — fetch one page, delete, repeat. Update the deletion loop to be type-by-type:

The cleanest approach is to restructure deletion to work per-type in a fetch-delete loop. This avoids issues with cursor invalidation. Update `handleStartDelete` to:

1. For each selected type, repeatedly fetch a page of IDs and delete them until no more are found
2. Update progress as we go

This will be refined during implementation based on what the tests show.

**Step 2: Run all tests**

Run: `bun run test`
Expected: ALL PASS

**Step 3: Run build**

Run: `bun run build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add src/pages/DeletePatientResourcesPage.tsx
git commit -m "feat: handle pagination for large resource sets during deletion"
```

---

### Task 6: Final verification and cleanup

**Step 1: Run full test suite**

Run: `bun run test`
Expected: ALL PASS

**Step 2: Run build**

Run: `bun run build`
Expected: SUCCESS

**Step 3: Verify no lint errors**

Check for any TypeScript strict mode issues (unused vars, etc.) and fix.

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: cleanup and fix any remaining lint issues"
```

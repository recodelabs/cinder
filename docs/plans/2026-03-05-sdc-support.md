# SDC Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate formbox-renderer to render FHIR Questionnaires as interactive forms and save responses as QuestionnaireResponse resources.

**Architecture:** Add a "Fill" tab to the Questionnaire detail page that embeds `@formbox/renderer` with the Mantine theme. On submit, create a QuestionnaireResponse linked to the Questionnaire. Add a "Response" tab to QuestionnaireResponse detail pages showing the filled form read-only. Add both resource types to the sidebar.

**Tech Stack:** @formbox/renderer 0.3.0, @formbox/mantine-theme 0.3.0, MobX 6, fhirpath, React 19

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install formbox packages and peer dependencies**

Run:
```bash
bun add @formbox/renderer @formbox/mantine-theme mobx mobx-react-lite mobx-utils fhirpath @lhncbc/ucum-lhc classnames
```

**Step 2: Verify install succeeded**

Run: `bun run build`
Expected: Clean build with no errors

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "Add formbox-renderer and peer dependencies for SDC support"
```

---

### Task 2: Add Questionnaire and QuestionnaireResponse to Resource Types

**Files:**
- Modify: `src/constants.ts`
- Modify: `src/pages/search-defaults.ts`

**Step 1: Add resource types to constants.ts**

Add `'Questionnaire'` and `'QuestionnaireResponse'` to the `RESOURCE_TYPES` array in `src/constants.ts`. Insert them alphabetically among the existing entries (after `Procedure` for Questionnaire, after `Questionnaire` for QuestionnaireResponse).

```typescript
export const RESOURCE_TYPES = [
  'Patient',
  'Practitioner',
  'Organization',
  'Encounter',
  'Observation',
  'Condition',
  'Procedure',
  'Questionnaire',
  'QuestionnaireResponse',
  'RelatedPerson',
  'MedicationRequest',
  'AllergyIntolerance',
  'Immunization',
  'DiagnosticReport',
  'CarePlan',
  'CareTeam',
  'Claim',
  'Coverage',
  'DocumentReference',
  'Goal',
  'Location',
  'Medication',
  'ServiceRequest',
  'Specimen',
] as const;
```

**Step 2: Add search defaults for the new types**

In `src/pages/search-defaults.ts`, add cases to `getDefaultFields()`:

```typescript
case 'Questionnaire':
  return ['_id', 'title', 'status', '_lastUpdated'];
case 'QuestionnaireResponse':
  return ['_id', 'questionnaire', 'subject', 'status', '_lastUpdated'];
```

**Step 3: Run tests**

Run: `bun run test`
Expected: All existing tests pass (no tests to add here — these are just config changes)

**Step 4: Commit**

```bash
git add src/constants.ts src/pages/search-defaults.ts
git commit -m "Add Questionnaire and QuestionnaireResponse to resource types"
```

---

### Task 3: Create QuestionnaireFillTab Component

This is the core component: renders a FHIR Questionnaire as an interactive form using formbox-renderer's Mantine theme.

**Files:**
- Create: `src/pages/QuestionnaireFillTab.tsx`
- Create: `src/pages/QuestionnaireFillTab.test.tsx`

**Step 1: Write the failing test**

Create `src/pages/QuestionnaireFillTab.test.tsx`:

```tsx
// ABOUTME: Tests for the QuestionnaireFillTab component.
// ABOUTME: Verifies questionnaire rendering and response submission.
import { MantineProvider } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { QuestionnaireFillTab } from './QuestionnaireFillTab';

const sampleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'q-1',
  status: 'active',
  title: 'Test Questionnaire',
  item: [
    {
      linkId: '1',
      text: 'What is your name?',
      type: 'string',
    },
  ],
};

function renderTab(questionnaire: Questionnaire = sampleQuestionnaire) {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => undefined });
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <QuestionnaireFillTab questionnaire={questionnaire} />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

describe('QuestionnaireFillTab', () => {
  it('renders the questionnaire form', () => {
    renderTab();
    expect(screen.getByText('What is your name?')).toBeDefined();
  });

  it('shows a submit button', () => {
    renderTab();
    expect(screen.getByRole('button', { name: /submit/i })).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test src/pages/QuestionnaireFillTab.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/pages/QuestionnaireFillTab.tsx`:

```tsx
// ABOUTME: Renders a FHIR Questionnaire as an interactive form using formbox-renderer.
// ABOUTME: On submit, creates a QuestionnaireResponse resource and navigates to it.
import { Alert, Button, Stack } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { safeErrorMessage } from '../errors';
import { Renderer } from '@formbox/renderer';
import { theme } from '@formbox/mantine-theme';
import '@formbox/mantine-theme/style.css';

interface QuestionnaireFillTabProps {
  readonly questionnaire: Questionnaire;
}

export function QuestionnaireFillTab({ questionnaire }: QuestionnaireFillTabProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error>();
  const responseRef = useRef<QuestionnaireResponse | undefined>(undefined);

  const handleChange = useCallback((response: QuestionnaireResponse) => {
    responseRef.current = response;
  }, []);

  const handleSubmit = useCallback(async () => {
    const response = responseRef.current;
    if (!response) return;

    const toSave: QuestionnaireResponse = {
      ...response,
      resourceType: 'QuestionnaireResponse',
      questionnaire: `Questionnaire/${questionnaire.id}`,
      status: 'completed',
      authored: new Date().toISOString(),
    };

    setSaving(true);
    setError(undefined);
    try {
      const saved = await medplum.createResource(toSave);
      navigate(`/QuestionnaireResponse/${saved.id}`);
    } catch (e) {
      setError(e as Error);
    } finally {
      setSaving(false);
    }
  }, [medplum, navigate, questionnaire.id]);

  return (
    <Stack>
      {error && <Alert color="red">{safeErrorMessage(error)}</Alert>}
      <Renderer
        questionnaire={questionnaire}
        theme={theme}
        fhirVersion="r4"
        onChange={handleChange}
      />
      <Button onClick={handleSubmit} loading={saving}>
        Submit Response
      </Button>
    </Stack>
  );
}
```

**Important notes for the implementer:**
- The exact `Renderer` props (especially `onChange` callback signature) need to be verified against the actual `@formbox/renderer` package. Install the package first, then check the TypeScript types to confirm the callback receives a `QuestionnaireResponse`.
- The `theme` import from `@formbox/mantine-theme` may be a named or default export — check after install.
- The CSS import path `@formbox/mantine-theme/style.css` may differ — verify the actual package exports.

**Step 4: Run test to verify it passes**

Run: `bun run test src/pages/QuestionnaireFillTab.test.tsx`
Expected: PASS

If formbox-renderer doesn't work well in jsdom (MobX + complex rendering), the tests may need adjustment. Potential fallback: mock the `Renderer` component in tests:

```typescript
vi.mock('@formbox/renderer', () => ({
  Renderer: ({ questionnaire }: { questionnaire: Questionnaire }) => (
    <div data-testid="formbox-renderer">{questionnaire.item?.[0]?.text}</div>
  ),
}));
```

**Step 5: Commit**

```bash
git add src/pages/QuestionnaireFillTab.tsx src/pages/QuestionnaireFillTab.test.tsx
git commit -m "Add QuestionnaireFillTab component with formbox-renderer"
```

---

### Task 4: Create QuestionnaireResponseViewTab Component

Shows a completed QuestionnaireResponse in the formbox renderer (read-only).

**Files:**
- Create: `src/pages/QuestionnaireResponseViewTab.tsx`
- Create: `src/pages/QuestionnaireResponseViewTab.test.tsx`

**Step 1: Write the failing test**

Create `src/pages/QuestionnaireResponseViewTab.test.tsx`:

```tsx
// ABOUTME: Tests for the QuestionnaireResponseViewTab component.
// ABOUTME: Verifies loading the referenced Questionnaire and displaying the response.
import { MantineProvider } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { QuestionnaireResponseViewTab } from './QuestionnaireResponseViewTab';

const sampleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'q-1',
  status: 'active',
  item: [{ linkId: '1', text: 'Your name?', type: 'string' }],
};

const sampleResponse: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  id: 'qr-1',
  questionnaire: 'Questionnaire/q-1',
  status: 'completed',
  item: [{ linkId: '1', text: 'Your name?', answer: [{ valueString: 'Alice' }] }],
};

function renderTab(response: QuestionnaireResponse = sampleResponse) {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => undefined });
  vi.spyOn(medplum, 'readResource').mockResolvedValue(sampleQuestionnaire);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <QuestionnaireResponseViewTab response={response} />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

describe('QuestionnaireResponseViewTab', () => {
  it('fetches the questionnaire and renders the response', async () => {
    const { medplum } = renderTab();
    expect(medplum.readResource).toHaveBeenCalledWith('Questionnaire', 'q-1');
  });

  it('shows loading state initially', () => {
    renderTab();
    // Should show a loader while fetching the questionnaire
    expect(screen.getByRole('presentation')).toBeDefined(); // Mantine Loader
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test src/pages/QuestionnaireResponseViewTab.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/pages/QuestionnaireResponseViewTab.tsx`:

```tsx
// ABOUTME: Displays a QuestionnaireResponse using formbox-renderer in read-only mode.
// ABOUTME: Fetches the referenced Questionnaire to provide the form structure.
import { Alert, Loader, Stack } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { safeErrorMessage } from '../errors';
import { Renderer } from '@formbox/renderer';
import { theme } from '@formbox/mantine-theme';
import '@formbox/mantine-theme/style.css';

interface QuestionnaireResponseViewTabProps {
  readonly response: QuestionnaireResponse;
}

function parseQuestionnaireRef(ref: string | undefined): { resourceType: string; id: string } | undefined {
  if (!ref) return undefined;
  // Handle both "Questionnaire/id" and full URLs
  const match = ref.match(/(?:Questionnaire\/)([^/]+)$/);
  if (match?.[1]) return { resourceType: 'Questionnaire', id: match[1] };
  return undefined;
}

export function QuestionnaireResponseViewTab({ response }: QuestionnaireResponseViewTabProps): JSX.Element {
  const medplum = useMedplum();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    const ref = parseQuestionnaireRef(response.questionnaire);
    if (!ref) {
      setError(new Error('QuestionnaireResponse has no questionnaire reference'));
      setLoading(false);
      return;
    }
    medplum
      .readResource(ref.resourceType as ResourceType, ref.id)
      .then((q) => setQuestionnaire(q as Questionnaire))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [medplum, response.questionnaire]);

  if (loading) return <Loader />;
  if (error) return <Alert color="red">{safeErrorMessage(error)}</Alert>;
  if (!questionnaire) return <Alert color="yellow">Could not load questionnaire</Alert>;

  return (
    <Stack>
      <Renderer
        questionnaire={questionnaire}
        theme={theme}
        fhirVersion="r4"
        initialResponse={response}
        readOnly
      />
    </Stack>
  );
}
```

**Important notes for the implementer:**
- Verify `readOnly` is an actual prop on formbox `Renderer`. If not, check for alternatives like `disabled` or a read-only theme wrapper. If no read-only mode exists, the form will be editable but without a submit button — still useful for viewing.
- The `initialResponse` prop name needs verification against the actual package types.

**Step 4: Run test to verify it passes**

Run: `bun run test src/pages/QuestionnaireResponseViewTab.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/QuestionnaireResponseViewTab.tsx src/pages/QuestionnaireResponseViewTab.test.tsx
git commit -m "Add QuestionnaireResponseViewTab component"
```

---

### Task 5: Wire Tabs into ResourceDetailPage

Add the "Fill" tab for Questionnaire resources and "Response" tab for QuestionnaireResponse resources.

**Files:**
- Modify: `src/pages/ResourceDetailPage.tsx`

**Step 1: Write the failing test**

There are no existing tests for `ResourceDetailPage.tsx`. For now, we'll verify manually and rely on the component-level tests from Tasks 3-4. The integration is straightforward conditional rendering.

**Step 2: Modify ResourceDetailPage.tsx**

Add imports at the top:

```tsx
import type { Questionnaire, QuestionnaireResponse, RelatedPerson, Resource, ResourceType } from '@medplum/fhirtypes';
import { QuestionnaireFillTab } from './QuestionnaireFillTab';
import { QuestionnaireResponseViewTab } from './QuestionnaireResponseViewTab';
```

In the Tabs.List section (after the JSON tab, around line 87), add conditional tabs:

```tsx
<Tabs.List>
  <Tabs.Tab value="details">Details</Tabs.Tab>
  <Tabs.Tab value="edit">Edit</Tabs.Tab>
  <Tabs.Tab value="json">JSON</Tabs.Tab>
  {resourceType === 'Questionnaire' && <Tabs.Tab value="fill">Fill</Tabs.Tab>}
  {resourceType === 'QuestionnaireResponse' && <Tabs.Tab value="response">Response</Tabs.Tab>}
</Tabs.List>
```

After the existing Tabs.Panel sections (after line 106), add:

```tsx
{resourceType === 'Questionnaire' && (
  <Tabs.Panel value="fill" pt="md">
    <QuestionnaireFillTab questionnaire={resource as Questionnaire} />
  </Tabs.Panel>
)}
{resourceType === 'QuestionnaireResponse' && (
  <Tabs.Panel value="response" pt="md">
    <QuestionnaireResponseViewTab response={resource as QuestionnaireResponse} />
  </Tabs.Panel>
)}
```

**Step 3: Run build and tests**

Run: `bun run build && bun run test`
Expected: Clean build, all tests pass

**Step 4: Commit**

```bash
git add src/pages/ResourceDetailPage.tsx
git commit -m "Add Fill and Response tabs to ResourceDetailPage for Questionnaire types"
```

---

### Task 6: Manual Integration Testing & Fixes

**Step 1: Start the dev server**

Run: `bun run dev`

**Step 2: Test the Questionnaire flow**

1. Navigate to the Questionnaire resource type in the sidebar
2. If questionnaires exist in the store, click one to see the detail page
3. Verify the "Fill" tab appears
4. Click "Fill" — verify the form renders with formbox-renderer
5. Fill in some answers and click "Submit Response"
6. Verify it creates a QuestionnaireResponse and navigates to it

**Step 3: Test the QuestionnaireResponse flow**

1. Navigate to the newly created QuestionnaireResponse
2. Verify the "Response" tab appears
3. Click "Response" — verify it loads the Questionnaire and shows the filled form

**Step 4: Fix any issues found**

Common issues to watch for:
- CSS conflicts between formbox Mantine theme and Cinder's Mantine setup
- Missing CSS import (the `@formbox/mantine-theme/style.css` path)
- `onChange` callback signature mismatch — may receive a different shape than `QuestionnaireResponse`
- `readOnly` prop may not exist — may need to remove or use alternative
- MobX version conflicts with React 19

**Step 5: Run full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 6: Commit any fixes**

```bash
git add -u
git commit -m "Fix SDC integration issues found during manual testing"
```

---

### Task 7: Final Build Verification

**Step 1: Full build**

Run: `bun run build`
Expected: Clean build

**Step 2: Full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 3: Push**

```bash
git push origin issue/REC-60
```

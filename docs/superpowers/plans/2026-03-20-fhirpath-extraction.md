# FHIRPath Mapping Language Extraction — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract FHIR resources from QuestionnaireResponses using FHIRPath Mapping Language templates stored as Questionnaire extensions.

**Architecture:** Client-side extraction using the `fhirpath` npm package. The beda-software `resolveTemplate` engine (~450 lines) is adapted as a local module in `src/fhir/`. An "Extraction" tab on Questionnaire detail pages lets users edit/test templates. After QR form submission, extraction runs automatically if a template is configured.

**Tech Stack:** fhirpath (already in package.json), Mantine UI, React, TypeScript

---

## File Structure

> **Note:** The spec defines a single `extraction.ts` file. The plan splits it into `extraction.ts` (engine, ~450 lines) and `extraction-helpers.ts` (orchestration, ~40 lines) because the engine is a direct adaptation of beda-software's code with its own concerns, while the helpers are Cinder-specific glue. This keeps the engine isolated and easier to update if upstream changes.

```
src/fhir/extraction.ts           — Core template resolution engine (adapted from beda-software)
src/fhir/extraction.test.ts      — Unit tests for template resolution
src/fhir/extraction-helpers.ts   — getExtractionTemplate, runExtraction orchestration, EXTRACTION_EXTENSION_URL
src/fhir/extraction-helpers.test.ts — Tests for helper functions
src/pages/ExtractionTab.tsx       — Extraction tab UI (template editor + test panel)
src/pages/ExtractionTab.test.tsx  — Tests for Extraction tab
```

**Modified files:**
```
src/pages/ResourceDetailPage.tsx  — Add "Extraction" tab for Questionnaire resources
src/pages/QuestionnaireFillTab.tsx — Add post-submission extraction logic
```

---

### Task 1: Core Template Resolution Engine

Adapt beda-software's `extract.ts` as a local module. This is the heart of the feature — it evaluates FHIRPath expressions embedded in JSON templates.

**Files:**
- Create: `src/fhir/extraction.ts`
- Create: `src/fhir/extraction.test.ts`

- [ ] **Step 1: Write failing tests for basic value interpolation**

```typescript
// src/fhir/extraction.test.ts
// ABOUTME: Tests for the FHIRPath Mapping Language template resolution engine.
// ABOUTME: Covers value interpolation, conditionals, loops, cleanup, and error handling.
import { describe, expect, it } from 'vitest';
import { resolveTemplate } from './extraction';

describe('resolveTemplate', () => {
  describe('value interpolation', () => {
    it('interpolates a simple string expression', () => {
      const resource = { resourceType: 'Patient', name: [{ given: ['John'] }] };
      const template = { greeting: "{{ Patient.name.first().given.first() }}" };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({ greeting: 'John' });
    });

    it('returns undefined for missing values and cleans up', () => {
      const resource = { resourceType: 'Patient' };
      const template = { phone: "{{ Patient.telecom.where(system='phone').value }}" };
      const result = resolveTemplate(resource, template);
      expect(result).toBeNull(); // entire object cleaned up
    });

    it('interpolates array expressions with {[ ]}', () => {
      const resource = {
        resourceType: 'QuestionnaireResponse',
        item: [
          { linkId: 'a', answer: [{ valueString: 'one' }] },
          { linkId: 'b', answer: [{ valueString: 'two' }] },
        ],
      };
      const template = {
        values: "{[ QuestionnaireResponse.item.answer.value ]}",
      };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({ values: ['one', 'two'] });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/fhir/extraction.test.ts`
Expected: FAIL — `resolveTemplate` not found

- [ ] **Step 3: Implement the core resolveTemplate engine**

Create `src/fhir/extraction.ts` adapted from beda-software's `extract.ts`. The full source is at `https://github.com/beda-software/FHIRPathMappingLanguage/blob/main/ts/server/src/core/extract.ts`. Adapt it as follows:

```typescript
// src/fhir/extraction.ts
// ABOUTME: FHIRPath Mapping Language template resolution engine.
// ABOUTME: Adapted from beda-software/FHIRPathMappingLanguage for client-side use in Cinder.
import * as fhirpath from 'fhirpath';
import type { Model } from 'fhirpath';

type Resource = Record<string, unknown>;
type Context = Record<string, unknown>;
type Path = Array<string | number>;

interface FPOptions {
  userInvocationTable?: Record<string, unknown>;
}

const rootNodeKey = '__rootNode__';

export class FPMLValidationError extends Error {
  errorPath: string;
  errorMessage: string;

  constructor(message: string, path: Path) {
    const pathStr = path.filter((x) => x !== rootNodeKey).join('.');
    super(`${message}. Path '${pathStr}'`);
    this.errorMessage = message;
    this.errorPath = pathStr;
  }
}

export function resolveTemplate(
  resource: Resource,
  template: unknown,
  context?: Context,
  model?: Model,
  fpOptions?: FPOptions,
): Record<string, unknown> | null {
  const result = resolveTemplateRecur(
    [],
    resource,
    template,
    { context: resource, ...(context ?? {}) },
    model,
    fpOptions,
  );
  return result === undefined ? null : result;
}
```

Copy the remaining functions from the beda-software source verbatim:
- `resolveTemplateRecur` — recursive template resolver
- `processTemplateString` — handles `{{ expr }}` and `{[ expr ]}` syntax
- `processAssignBlock` — `{% assign %}` variable binding
- `processMergeBlock` — `{% merge %}` object combining
- `processForBlock` — `{% for item in expr %}` loops
- `processContextBlock` — `{{ expr }}` as object key for context switching
- `processIfBlock` — `{% if expr %}` / `{% else %}` conditionals
- `iterateObject` — recursive traversal with cleanup
- `evaluateExpression` — delegates to `fhirpath.evaluate()`
- Helper functions: `isPlainObject`, `mapValues`, `omitKey`

Key adaptations:
1. Change `any` types to `unknown` where possible for TypeScript strict mode
2. Remove `strict` mode / `guardedResourceFactory` (not needed for Cinder)
3. Add ABOUTME comment header
4. Export only `resolveTemplate`, `evaluateExpression`, and `FPMLValidationError`

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- src/fhir/extraction.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/fhir/extraction.ts src/fhir/extraction.test.ts
git commit -m "feat: add FHIRPath Mapping Language template resolution engine"
```

---

### Task 2: Additional Template Resolution Tests

Add tests for conditionals, for-loops, assign, merge, cleanup, and error handling.

**Files:**
- Modify: `src/fhir/extraction.test.ts`

- [ ] **Step 1: Add tests for {% if %} conditionals**

```typescript
describe('conditionals', () => {
  it('includes block when condition is truthy', () => {
    const resource = { resourceType: 'Patient', active: true };
    const template = {
      "{% if Patient.active %}": { status: "active" },
    };
    const result = resolveTemplate(resource, template);
    expect(result).toEqual({ status: 'active' });
  });

  it('removes block when condition is falsy', () => {
    const resource = { resourceType: 'Patient' };
    const template = {
      "{% if Patient.active %}": { status: "active" },
    };
    const result = resolveTemplate(resource, template);
    expect(result).toBeNull();
  });

  it('uses else branch when condition is falsy', () => {
    const resource = { resourceType: 'Patient' };
    const template = {
      "{% if Patient.active %}": { status: "active" },
      "{% else %}": { status: "unknown" },
    };
    const result = resolveTemplate(resource, template);
    expect(result).toEqual({ status: 'unknown' });
  });

  it('merges if result into surrounding object', () => {
    const resource = { resourceType: 'Patient', active: true };
    const template = {
      resourceType: "Patient",
      "{% if Patient.active %}": { status: "active" },
    };
    const result = resolveTemplate(resource, template);
    expect(result).toEqual({ resourceType: 'Patient', status: 'active' });
  });
});
```

- [ ] **Step 2: Add tests for {% for %} loops**

```typescript
describe('for loops', () => {
  it('iterates over array', () => {
    const resource = {
      resourceType: 'QuestionnaireResponse',
      item: [
        { linkId: 'a', answer: [{ valueString: 'x' }] },
        { linkId: 'b', answer: [{ valueString: 'y' }] },
      ],
    };
    const template = {
      answers: [
        {
          "{% for item in QuestionnaireResponse.item %}": {
            id: "{{ %item.linkId }}",
            value: "{{ %item.answer.value }}",
          },
        },
      ],
    };
    const result = resolveTemplate(resource, template);
    expect(result).toEqual({
      answers: [
        { id: 'a', value: 'x' },
        { id: 'b', value: 'y' },
      ],
    });
  });
});
```

- [ ] **Step 3: Add tests for {% assign %} and auto-cleanup**

```typescript
describe('assign', () => {
  it('binds variables for use in template', () => {
    const resource = { resourceType: 'Patient', name: [{ given: ['Jane'] }] };
    const template = {
      "{% assign %}": { firstName: "{{ Patient.name.first().given.first() }}" },
      greeting: "{{ %firstName }}",
    };
    const result = resolveTemplate(resource, template);
    expect(result).toEqual({ greeting: 'Jane' });
  });
});

describe('auto-cleanup', () => {
  it('removes empty objects', () => {
    const resource = { resourceType: 'Patient' };
    const template = {
      name: { given: "{{ Patient.name.given }}" },
    };
    const result = resolveTemplate(resource, template);
    expect(result).toBeNull();
  });

  it('removes empty arrays', () => {
    const resource = { resourceType: 'Patient' };
    const template = {
      names: ["{{ Patient.name.given }}"],
    };
    const result = resolveTemplate(resource, template);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 4: Add test for {% merge %}**

```typescript
describe('merge', () => {
  it('merges multiple objects', () => {
    const resource = { resourceType: 'Patient', name: [{ given: ['A'] }], birthDate: '2000-01-01' };
    const template = {
      "{% merge %}": [
        { name: "{{ Patient.name }}" },
        { dob: "{{ Patient.birthDate }}" },
      ],
    };
    const result = resolveTemplate(resource, template);
    expect(result).toMatchObject({ dob: '2000-01-01' });
  });
});
```

- [ ] **Step 5: Add test for FHIRPath evaluation error**

```typescript
describe('error handling', () => {
  it('throws FPMLValidationError for invalid expressions', () => {
    const resource = { resourceType: 'Patient' };
    const template = { bad: "{{ %%%invalid%%% }}" };
    expect(() => resolveTemplate(resource, template)).toThrow();
  });
});
```

- [ ] **Step 6: Run all tests**

Run: `bun run test -- src/fhir/extraction.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/fhir/extraction.test.ts
git commit -m "test: add comprehensive tests for template resolution"
```

---

### Task 3: Extraction Helper Functions

Create `getExtractionTemplate` and `runExtraction` — the bridge between FHIR resources and the template engine.

**Files:**
- Create: `src/fhir/extraction-helpers.ts`
- Create: `src/fhir/extraction-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/fhir/extraction-helpers.test.ts
// ABOUTME: Tests for extraction orchestration helpers.
// ABOUTME: Covers reading templates from Questionnaire extensions and running extraction.
import { describe, expect, it } from 'vitest';
import { getExtractionTemplate, runExtraction, EXTRACTION_EXTENSION_URL } from './extraction-helpers';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';

describe('getExtractionTemplate', () => {
  it('returns null when no extraction extension exists', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    expect(getExtractionTemplate(q)).toBeNull();
  });

  it('returns parsed template array from extension', () => {
    const template = [{ resourceType: 'Patient', name: "{{ QuestionnaireResponse.item.first().answer.value }}" }];
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [
        { url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) },
      ],
    };
    expect(getExtractionTemplate(q)).toEqual(template);
  });

  it('returns null for invalid JSON in extension', () => {
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [
        { url: EXTRACTION_EXTENSION_URL, valueString: 'not json{' },
      ],
    };
    expect(getExtractionTemplate(q)).toBeNull();
  });
});

describe('runExtraction', () => {
  it('resolves a single-resource template', () => {
    const template = [{ resourceType: 'Patient', birthDate: "{{ QuestionnaireResponse.item.where(linkId='dob').answer.value }}" }];
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [{ url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) }],
    };
    const qr: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [{ linkId: 'dob', answer: [{ valueDate: '1990-01-01' }] }],
    };
    const result = runExtraction(q, qr);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ resourceType: 'Patient', birthDate: '1990-01-01' });
  });

  it('returns empty array when no template configured', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    const qr: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed' };
    expect(runExtraction(q, qr)).toEqual([]);
  });

  it('filters out null results from templates', () => {
    const template = [
      { resourceType: 'Patient', name: "{{ QuestionnaireResponse.item.where(linkId='missing').answer.value }}" },
    ];
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [{ url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) }],
    };
    const qr: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed' };
    expect(runExtraction(q, qr)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/fhir/extraction-helpers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement extraction helpers**

```typescript
// src/fhir/extraction-helpers.ts
// ABOUTME: Orchestration helpers for FHIR resource extraction from QuestionnaireResponses.
// ABOUTME: Reads extraction templates from Questionnaire extensions and runs the template engine.
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import r4model from 'fhirpath/fhir-context/r4';
import { resolveTemplate } from './extraction';

export const EXTRACTION_EXTENSION_URL = 'http://beda.software/fhir-extensions/fhir-path-mapping-language';

/**
 * Reads the extraction template from a Questionnaire's extensions.
 * Returns the parsed template array, or null if not configured or invalid.
 */
export function getExtractionTemplate(
  questionnaire: Questionnaire,
): Record<string, unknown>[] | null {
  const ext = questionnaire.extension?.find((e) => e.url === EXTRACTION_EXTENSION_URL);
  if (!ext?.valueString) return null;
  try {
    const parsed = JSON.parse(ext.valueString);
    if (!Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>[];
  } catch {
    return null;
  }
}

/**
 * Runs extraction: resolves each template in the array against the QR.
 * Returns an array of FHIR resources to create. Does NOT create them.
 */
export function runExtraction(
  questionnaire: Questionnaire,
  questionnaireResponse: QuestionnaireResponse,
): Record<string, unknown>[] {
  const templates = getExtractionTemplate(questionnaire);
  if (!templates) return [];

  const context = { QuestionnaireResponse: questionnaireResponse };
  const results: Record<string, unknown>[] = [];

  for (const template of templates) {
    const result = resolveTemplate(
      questionnaireResponse as unknown as Record<string, unknown>,
      template,
      context,
      r4model,
    );
    if (result) {
      results.push(result);
    }
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- src/fhir/extraction-helpers.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/fhir/extraction-helpers.ts src/fhir/extraction-helpers.test.ts
git commit -m "feat: add extraction orchestration helpers"
```

---

### Task 4: Extraction Tab UI

Create the Extraction tab component for the Questionnaire detail page — template editor and test panel.

**Files:**
- Create: `src/pages/ExtractionTab.tsx`
- Modify: `src/pages/ResourceDetailPage.tsx` (lines 3, 14-16, 90-91, 111-115)

- [ ] **Step 1: Create ExtractionTab component**

```typescript
// src/pages/ExtractionTab.tsx
// ABOUTME: Extraction tab for Questionnaire resources — template editor and test panel.
// ABOUTME: Lets users configure and test FHIRPath Mapping Language extraction templates.
import { Alert, Button, Code, Group, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { safeErrorMessage } from '../errors';
import {
  EXTRACTION_EXTENSION_URL,
  getExtractionTemplate,
  runExtraction,
} from '../fhir/extraction-helpers';

interface ExtractionTabProps {
  readonly questionnaire: Questionnaire;
  readonly onSave: (updated: Questionnaire) => void;
}

export function ExtractionTab({ questionnaire, onSave }: ExtractionTabProps): JSX.Element {
  const medplum = useMedplum();
  const [templateJson, setTemplateJson] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Test panel state
  const [qrId, setQrId] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState('');
  const [testing, setTesting] = useState(false);

  // Load existing template from questionnaire extension
  useEffect(() => {
    const existing = getExtractionTemplate(questionnaire);
    if (existing) {
      setTemplateJson(JSON.stringify(existing, null, 2));
    }
  }, [questionnaire]);

  const handleSave = useCallback(async () => {
    setSaveError('');
    setSaveSuccess(false);
    setSaving(true);
    try {
      // Validate JSON
      const parsed = JSON.parse(templateJson);
      if (!Array.isArray(parsed)) {
        setSaveError('Template must be a JSON array of resource templates');
        setSaving(false);
        return;
      }

      // Update the extension on the questionnaire
      const extensions = (questionnaire.extension ?? []).filter(
        (e) => e.url !== EXTRACTION_EXTENSION_URL,
      );
      extensions.push({
        url: EXTRACTION_EXTENSION_URL,
        valueString: JSON.stringify(parsed),
      });

      const updated = await medplum.updateResource({
        ...questionnaire,
        extension: extensions,
      });
      onSave(updated as Questionnaire);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof SyntaxError
        ? 'Invalid JSON — please fix syntax errors'
        : safeErrorMessage(err instanceof Error ? err : new Error(String(err))));
    } finally {
      setSaving(false);
    }
  }, [medplum, questionnaire, templateJson, onSave]);

  const handleTest = useCallback(async () => {
    setTestError('');
    setTestResult(null);
    setTesting(true);
    try {
      // Parse the template from the editor (not from saved extension)
      const parsed = JSON.parse(templateJson);
      if (!Array.isArray(parsed)) {
        setTestError('Template must be a JSON array');
        setTesting(false);
        return;
      }

      // Fetch the QuestionnaireResponse
      const qr = await medplum.readResource('QuestionnaireResponse', qrId.trim());

      // Build a temporary questionnaire with the current (unsaved) template
      const tempQ: Questionnaire = {
        ...questionnaire,
        extension: [
          ...(questionnaire.extension ?? []).filter((e) => e.url !== EXTRACTION_EXTENSION_URL),
          { url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(parsed) },
        ],
      };

      const results = runExtraction(tempQ, qr as QuestionnaireResponse);
      setTestResult(JSON.stringify(results, null, 2));
    } catch (err) {
      setTestError(safeErrorMessage(err instanceof Error ? err : new Error(String(err))));
    } finally {
      setTesting(false);
    }
  }, [medplum, questionnaire, templateJson, qrId]);

  return (
    <Stack gap="md">
      <Title order={4}>Extraction Template</Title>
      <Text size="sm" c="dimmed">
        Define a JSON array of resource templates using FHIRPath Mapping Language syntax.
        Each template produces one FHIR resource when a QuestionnaireResponse is submitted.
      </Text>
      <Textarea
        value={templateJson}
        onChange={(e) => {
          setTemplateJson(e.currentTarget.value);
          setSaveSuccess(false);
        }}
        placeholder={'[\n  {\n    "resourceType": "Patient",\n    "name": [{"given": ["{{ QuestionnaireResponse.item.where(linkId=\'name\').answer.value }}"]}]\n  }\n]'}
        rows={16}
        styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
      />
      <Group>
        <Button onClick={handleSave} loading={saving} disabled={!templateJson.trim()}>
          Save Template
        </Button>
        {saveSuccess && <Text size="sm" c="green">Saved</Text>}
      </Group>
      {saveError && <Alert color="red">{saveError}</Alert>}

      <Title order={4} mt="lg">Test Extraction</Title>
      <Text size="sm" c="dimmed">
        Enter a QuestionnaireResponse ID to test the template against.
      </Text>
      <Group>
        <TextInput
          value={qrId}
          onChange={(e) => setQrId(e.currentTarget.value)}
          placeholder="QuestionnaireResponse ID"
          style={{ flex: 1 }}
          styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
        />
        <Button
          onClick={handleTest}
          loading={testing}
          disabled={!qrId.trim() || !templateJson.trim()}
          variant="light"
        >
          Test
        </Button>
      </Group>
      {testError && <Alert color="red">{testError}</Alert>}
      {testResult && (
        <Code block style={{ maxHeight: 400, overflow: 'auto' }}>
          {testResult}
        </Code>
      )}
    </Stack>
  );
}
```

- [ ] **Step 2: Add "Extraction" tab to ResourceDetailPage**

In `src/pages/ResourceDetailPage.tsx`:

Add import at top (after line 16):
```typescript
import { ExtractionTab } from './ExtractionTab';
```

Add tab header after line 90 (the Fill tab):
```typescript
{resourceType === 'Questionnaire' && <Tabs.Tab value="extraction">Extraction</Tabs.Tab>}
```

Add tab panel after line 115 (the Fill panel closing):
```typescript
{resourceType === 'Questionnaire' && (
  <Tabs.Panel value="extraction" pt="md">
    <ExtractionTab
      questionnaire={resource as Questionnaire}
      onSave={(updated) => setResource(updated)}
    />
  </Tabs.Panel>
)}
```

- [ ] **Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/ExtractionTab.tsx src/pages/ResourceDetailPage.tsx
git commit -m "feat: add Extraction tab to Questionnaire detail page"
```

---

### Task 5: ExtractionTab Tests

**Files:**
- Create: `src/pages/ExtractionTab.test.tsx`

- [ ] **Step 1: Write tests for ExtractionTab**

```typescript
// src/pages/ExtractionTab.test.tsx
// ABOUTME: Tests for the Extraction tab component on Questionnaire detail pages.
// ABOUTME: Verifies template editing, saving, and test extraction functionality.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ExtractionTab } from './ExtractionTab';
import type { Questionnaire } from '@medplum/fhirtypes';
import { EXTRACTION_EXTENSION_URL } from '../fhir/extraction-helpers';

// Mock useMedplum
const mockUpdateResource = vi.fn();
const mockReadResource = vi.fn();
vi.mock('@medplum/react-hooks', () => ({
  useMedplum: () => ({
    updateResource: mockUpdateResource,
    readResource: mockReadResource,
  }),
}));

function renderTab(questionnaire: Questionnaire, onSave = vi.fn()) {
  return render(
    <MantineProvider>
      <ExtractionTab questionnaire={questionnaire} onSave={onSave} />
    </MantineProvider>,
  );
}

describe('ExtractionTab', () => {
  it('renders template editor with existing template', () => {
    const template = [{ resourceType: 'Patient' }];
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [{ url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) }],
    };
    renderTab(q);
    expect(screen.getByText('Extraction Template')).toBeDefined();
    expect(screen.getByDisplayValue(/Patient/)).toBeDefined();
  });

  it('renders empty editor when no template exists', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q);
    expect(screen.getByText('Extraction Template')).toBeDefined();
    expect(screen.getByPlaceholderText(/resourceType/)).toBeDefined();
  });

  it('shows error for invalid JSON on save', async () => {
    const user = userEvent.setup();
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q);

    const textarea = screen.getByPlaceholderText(/resourceType/);
    await user.clear(textarea);
    await user.type(textarea, 'not valid json{');
    await user.click(screen.getByText('Save Template'));

    expect(screen.getByText(/Invalid JSON/)).toBeDefined();
  });

  it('saves template by updating questionnaire extension', async () => {
    const user = userEvent.setup();
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'q-1',
      status: 'active',
    };
    const onSave = vi.fn();
    const updatedQ = { ...q, extension: [{ url: EXTRACTION_EXTENSION_URL, valueString: '[{"resourceType":"Patient"}]' }] };
    mockUpdateResource.mockResolvedValue(updatedQ);

    renderTab(q, onSave);
    const textarea = screen.getByPlaceholderText(/resourceType/);
    await user.type(textarea, '[{{"resourceType":"Patient"}}]');
    await user.click(screen.getByText('Save Template'));

    expect(mockUpdateResource).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `bun run test -- src/pages/ExtractionTab.test.tsx`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/ExtractionTab.test.tsx
git commit -m "test: add ExtractionTab component tests"
```

---

### Task 6: Post-Submission Extraction in QuestionnaireFillTab

Wire up automatic extraction after QuestionnaireResponse creation.

**Files:**
- Modify: `src/pages/QuestionnaireFillTab.tsx`

- [ ] **Step 1: Read current QuestionnaireFillTab**

Read `src/pages/QuestionnaireFillTab.tsx` to see the exact current state of the file.

- [ ] **Step 2: Add extraction logic after QR creation**

Add imports at top of `src/pages/QuestionnaireFillTab.tsx`:
```typescript
import { notifications } from '@mantine/notifications';
import { getExtractionTemplate, runExtraction } from '../fhir/extraction-helpers';
```

Check if `@mantine/notifications` is set up in `AppProviders.tsx`. If not, add `<Notifications />` from `@mantine/notifications` and `import '@mantine/notifications/styles.css'`.

Replace the `handleSubmit` callback with extraction logic:

```typescript
const handleSubmit = useCallback(
  (response: QuestionnaireResponseOf<'r4'>) => {
    setError(undefined);
    setSubmitting(true);

    const questionnaireResponse: QuestionnaireResponse = {
      ...(response as unknown as QuestionnaireResponse),
      resourceType: 'QuestionnaireResponse',
      questionnaire: `Questionnaire/${questionnaire.id}`,
      status: 'completed',
    };

    medplum
      .createResource(questionnaireResponse)
      .then(async (created) => {
        // Run extraction if template is configured
        try {
          const template = getExtractionTemplate(questionnaire);
          if (template) {
            const resources = runExtraction(questionnaire, created as QuestionnaireResponse);
            const results: Array<{ resourceType: string; id?: string; error?: string }> = [];

            for (const resource of resources) {
              try {
                const saved = await medplum.createResource(resource as Resource);
                results.push({ resourceType: saved.resourceType, id: saved.id });
              } catch (err) {
                results.push({
                  resourceType: (resource as Resource).resourceType ?? 'Unknown',
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }

            if (results.length > 0) {
              const successes = results.filter((r) => r.id);
              const failures = results.filter((r) => r.error);

              notifications.show({
                title: `Extracted ${successes.length} resource${successes.length !== 1 ? 's' : ''}`,
                message: [
                  ...successes.map((r) => `${r.resourceType}/${r.id}`),
                  ...failures.map((r) => `Failed: ${r.resourceType} — ${r.error}`),
                ].join('\n'),
                color: failures.length > 0 ? 'yellow' : 'green',
                autoClose: 8000,
              });
            }
          }
        } catch (extractErr) {
          notifications.show({
            title: 'Extraction failed',
            message: extractErr instanceof Error ? extractErr.message : String(extractErr),
            color: 'red',
            autoClose: 8000,
          });
        }

        navigate(`/${created.resourceType}/${created.id}`);
      })
      .catch((err: unknown) => {
        setSubmitting(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      });
  },
  [medplum, navigate, questionnaire.id, questionnaire],
);
```

- [ ] **Step 3: Set up Mantine Notifications provider**

`<Notifications />` is not currently in `AppProviders.tsx`. This is required for `notifications.show()` to work.

Add to `src/AppProviders.tsx`:
```typescript
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
```

Add `<Notifications position="top-right" />` as the first child inside `<MantineProvider>` in the `AppProviders` function (before `<AuthProvider>`):
```typescript
<MantineProvider>
  <Notifications position="top-right" />
  <AuthProvider>
    ...
  </AuthProvider>
</MantineProvider>
```

- [ ] **Step 4: Verify build passes**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 5: Run all tests**

Run: `bun run test`
Expected: All tests pass (existing + new)

- [ ] **Step 6: Commit**

```bash
git add src/pages/QuestionnaireFillTab.tsx src/AppProviders.tsx
git commit -m "feat: run extraction automatically after QuestionnaireResponse submission"
```

---

### Task 7: End-to-End Integration Test

Add a test for the full extraction flow with the patient registration example from the spec.

**Files:**
- Modify: `src/fhir/extraction-helpers.test.ts`

- [ ] **Step 1: Add the patient registration integration test**

```typescript
describe('patient registration extraction', () => {
  it('extracts a Patient from a patient registration QR', () => {
    const template = [
      {
        resourceType: 'Patient',
        name: [{
          given: ["{{ QuestionnaireResponse.item.where(linkId='name').item.where(linkId='name.given').answer.value }}"],
          family: "{{ QuestionnaireResponse.item.where(linkId='name').item.where(linkId='name.family').answer.value }}",
        }],
        birthDate: "{{ QuestionnaireResponse.item.where(linkId='birthDate').answer.value }}",
        gender: "{{ QuestionnaireResponse.item.where(linkId='gender').answer.value.code }}",
        telecom: [
          {
            "{% if QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.phone').answer.value %}": {
              system: 'phone',
              value: "{{ QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.phone').answer.value }}",
            },
          },
          {
            "{% if QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.email').answer.value %}": {
              system: 'email',
              value: "{{ QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.email').answer.value }}",
            },
          },
        ],
        identifier: [{
          "{% if QuestionnaireResponse.item.where(linkId='identifier').answer.value %}": {
            value: "{{ QuestionnaireResponse.item.where(linkId='identifier').answer.value }}",
          },
        }],
      },
    ];

    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [{ url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) }],
    };

    const qr: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'name',
          text: 'Name',
          item: [
            { linkId: 'name.given', text: 'Given Name', answer: [{ valueString: 'Asa' }] },
            { linkId: 'name.family', text: 'Family Name', answer: [{ valueString: 'Berg' }] },
          ],
        },
        { linkId: 'birthDate', text: 'Date of Birth', answer: [{ valueDate: '2026-03-03' }] },
        {
          linkId: 'gender',
          text: 'Administrative Gender',
          answer: [{ valueCoding: { system: 'http://hl7.org/fhir/administrative-gender', code: 'female', display: 'Female' } }],
        },
        {
          linkId: 'telecom',
          text: 'Contact',
          item: [
            { linkId: 'telecom.phone', text: 'Phone Number', answer: [{ valueString: '911' }] },
            { linkId: 'telecom.email', text: 'Email Address', answer: [{ valueString: 'joe@blow.com' }] },
          ],
        },
        { linkId: 'identifier', text: 'National ID', answer: [{ valueString: '5544' }] },
      ],
    };

    const result = runExtraction(q, qr);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      resourceType: 'Patient',
      name: [{ given: ['Asa'], family: 'Berg' }],
      birthDate: '2026-03-03',
      gender: 'female',
      telecom: [
        { system: 'phone', value: '911' },
        { system: 'email', value: 'joe@blow.com' },
      ],
      identifier: [{ value: '5544' }],
    });
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `bun run test`
Expected: ALL PASS

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add src/fhir/extraction-helpers.test.ts
git commit -m "test: add patient registration end-to-end extraction test"
```

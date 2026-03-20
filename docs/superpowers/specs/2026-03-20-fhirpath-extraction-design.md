# FHIRPath Mapping Language Extraction — Design Spec

## Goal

Add the ability to extract FHIR resources (e.g., Patient, Observation) from QuestionnaireResponses in Cinder using the FHIRPath Mapping Language (beda-software). Extraction templates are stored as extensions on Questionnaire resources and executed client-side in the browser after form submission.

## Architecture

Extraction runs entirely client-side, consistent with Cinder's architecture where the browser handles all FHIR operations and the server is a pure proxy. The `fhirpath` npm package evaluates FHIRPath expressions. The beda-software template resolution logic is adapted as a local module — their core `resolveTemplate` function is ~200 lines with one dependency (`fhirpath`).

## Where Mappings Live

Extraction templates are stored as a FHIR extension on the Questionnaire resource:

```json
{
  "url": "http://beda.software/fhir-extensions/fhir-path-mapping-language",
  "valueString": "[{\"resourceType\":\"Patient\", ...}]"
}
```

The template is a **JSON array of resource templates**, serialized as a string in `valueString`. Each element in the array is a template for one resource to create. A single-resource extraction uses a one-element array. This is portable and follows FHIR extension conventions.

## Extraction Flow

1. User fills Questionnaire form → submits → QuestionnaireResponse is created (existing flow, unchanged)
2. The Questionnaire is already available as a prop in QuestionnaireFillTab — no re-fetch needed
3. Call `getExtractionTemplate(questionnaire)` to check for extraction template extension
4. If template exists: for each template in the array, run `resolveTemplate(questionnaireResponse, template)` in the browser
5. Create each extracted resource via individual `medplum.createResource()` calls (not a transaction Bundle)
6. Show success notification with clickable links to the created resources

## New Module: `src/fhir/extraction.ts`

Core extraction logic, adapted from beda-software's `resolveTemplate`.

### Constants

```typescript
const EXTRACTION_EXTENSION_URL = 'http://beda.software/fhir-extensions/fhir-path-mapping-language';
```

### Functions

```typescript
/**
 * Evaluates a mapping template against a FHIR resource.
 * Handles: {{ expr }} value interpolation, {[ expr ]} array expressions,
 * {% assign %}, {% if %}, {% for %}, {% merge %} control flow,
 * and auto-cleanup of nulls/empty values/empty arrays/empty objects.
 *
 * For {% if %} blocks: the key is the condition, the value is the object to include.
 * When the condition is truthy, the inner object replaces the wrapper object.
 * When falsy, the entire object is removed (and cleaned up from parent arrays).
 */
function resolveTemplate(
  resource: Record<string, unknown>,
  template: Record<string, unknown>,
  context?: Record<string, unknown>,
): Record<string, unknown> | null

/**
 * Reads the extraction extension from a Questionnaire.
 * Returns the parsed template array, or null if no extraction template is configured.
 */
function getExtractionTemplate(
  questionnaire: Questionnaire,
): Record<string, unknown>[] | null

/**
 * Runs extraction: gets the template array, resolves each template against
 * the QuestionnaireResponse, returns the array of FHIR resources to create.
 * Does NOT create the resources — the caller handles that.
 */
function runExtraction(
  questionnaire: Questionnaire,
  questionnaireResponse: QuestionnaireResponse,
): Record<string, unknown>[]
```

### Dependencies

- `fhirpath` npm package (already a direct dependency in package.json)
- FHIR R4 model from `fhirpath/fhir-context/r4` for type-aware expression evaluation

## New UI: Extraction Tab on Questionnaire Detail Page

A new "Extraction" tab on the Questionnaire detail page (alongside Details, Edit, JSON, Fill). Requires changes to `ResourceDetailPage.tsx` to add the tab to `<Tabs.List>` and render `<ExtractionTab>` in the corresponding panel, conditional on `resourceType === 'Questionnaire'`.

### Template Editor
- Mantine `Textarea` with monospace font for editing the mapping template JSON (the array of resource templates)
- Validates JSON on save, shows parse errors inline
- Save button writes the template back to the Questionnaire resource as the extension

### Test Panel
- Dropdown/input to select an existing QuestionnaireResponse for this Questionnaire (search by `questionnaire=Questionnaire/{id}`)
- "Test Extraction" button runs `runExtraction()` against the selected QR
- Shows the output resources as formatted JSON preview — no resources are created
- Errors displayed inline

### Save Behavior
- Reads the current Questionnaire, adds/updates the extraction extension, calls `medplum.updateResource()`

## Changes to QuestionnaireFillTab

The `questionnaire` prop is already available — no need to re-fetch.

After successful QR creation (in the `.then()` handler):

1. Call `getExtractionTemplate(questionnaire)` — if null, skip extraction (existing behavior, just navigate)
2. If template exists, call `runExtraction(questionnaire, questionnaireResponse)`
3. For each extracted resource, call `medplum.createResource(resource)`, collect results
4. Show Mantine notification with links to created resources (e.g., "Created Patient/abc-123")
5. Navigate to the QuestionnaireResponse (existing behavior)

Extraction is wrapped in try/catch — failures show a warning notification but do not block QR creation or navigation.

## Error Handling

- **Template parsing errors** — Displayed in the Extraction tab editor as red text below the textarea
- **FHIRPath evaluation errors** — Shown as a warning notification after QR submission. The QR is still saved — extraction failure does not block QR creation.
- **Individual resource creation failures** — Notification shows which resources succeeded and which failed, with error messages

## File Structure

```
src/fhir/extraction.ts          — Core extraction logic (resolveTemplate, getExtractionTemplate, runExtraction)
src/fhir/extraction.test.ts     — Tests for extraction logic
src/pages/ExtractionTab.tsx      — Extraction tab UI component
src/pages/ExtractionTab.test.tsx — Tests for Extraction tab
```

Changes to existing files:
- `src/pages/ResourceDetailPage.tsx` — Add "Extraction" tab for Questionnaire resources, import and render ExtractionTab
- `src/pages/QuestionnaireFillTab.tsx` — Add post-submission extraction logic

## Testing Strategy

### extraction.test.ts
- Simple value interpolation (`{{ expr }}`) — single string, date, coding values
- Nested item traversal (`item.where(linkId='x').item.where(linkId='y')`)
- Conditional blocks (`{% if %}`) — truthy produces inner object, falsy removes it
- Array expressions (`{[ expr ]}`) — returns full array not just first element
- Auto-cleanup — nulls, empty strings, empty arrays, empty objects are removed
- Multi-resource templates — array with two templates produces two resources
- Malformed template — invalid JSON in extension returns null from `getExtractionTemplate`
- Template with no matching QR items — all expressions resolve to empty, cleanup removes them
- `getExtractionTemplate` — Questionnaire with extension returns parsed template; without returns null

### ExtractionTab.test.tsx
- Renders template editor with existing template from Questionnaire extension
- Save writes updated extension back to Questionnaire
- Test panel runs extraction and displays preview
- JSON parse errors shown inline

## Example

Given the patient registration Questionnaire, an extraction template (single-resource, so a one-element array):

```json
[
  {
    "resourceType": "Patient",
    "name": [
      {
        "given": [
          "{{ QuestionnaireResponse.item.where(linkId='name').item.where(linkId='name.given').answer.value }}"
        ],
        "family": "{{ QuestionnaireResponse.item.where(linkId='name').item.where(linkId='name.family').answer.value }}"
      }
    ],
    "birthDate": "{{ QuestionnaireResponse.item.where(linkId='birthDate').answer.value }}",
    "gender": "{{ QuestionnaireResponse.item.where(linkId='gender').answer.value.code }}",
    "telecom": [
      {
        "{% if QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.phone').answer.value %}": {
          "system": "phone",
          "value": "{{ QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.phone').answer.value }}"
        }
      },
      {
        "{% if QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.email').answer.value %}": {
          "system": "email",
          "value": "{{ QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.email').answer.value }}"
        }
      }
    ],
    "identifier": [
      {
        "{% if QuestionnaireResponse.item.where(linkId='identifier').answer.value %}": {
          "value": "{{ QuestionnaireResponse.item.where(linkId='identifier').answer.value }}"
        }
      }
    ]
  }
]
```

**Applied to the example QuestionnaireResponse, this produces:**

```json
{
  "resourceType": "Patient",
  "name": [
    {
      "given": ["Asa"],
      "family": "Berg"
    }
  ],
  "birthDate": "2026-03-03",
  "gender": "female",
  "telecom": [
    { "system": "phone", "value": "911" },
    { "system": "email", "value": "joe@blow.com" }
  ],
  "identifier": [
    { "value": "5544" }
  ]
}
```

The `{% if %}` blocks work as follows: when the condition is truthy, the inner object replaces the wrapper `{ "{% if ... %}": { ... } }` object in the array. When falsy, the wrapper object becomes empty and is removed by auto-cleanup.

## Known Limitations

- **No Questionnaire versioning** — If a Questionnaire's extraction template is updated after QRs have been created, testing extraction against old QRs may produce unexpected results. The Test Panel does not warn about version mismatches.
- **No template complexity limits** — Deeply nested `{% for %}` loops or expensive FHIRPath expressions could slow the browser. No timeout is enforced in the initial implementation.

## Out of Scope

- Server-side extraction (could be added later)
- Transaction Bundles for atomic multi-resource creation
- Extraction template authoring wizard / visual builder
- Automatic extraction on QR creation without user having set up a template

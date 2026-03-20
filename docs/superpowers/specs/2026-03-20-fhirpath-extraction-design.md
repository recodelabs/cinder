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
  "valueString": "{\"resourceType\":\"Patient\", \"name\": [{\"given\": [\"{{ QuestionnaireResponse.item.where(linkId='name.given').answer.value }}\"]}]}"
}
```

The template is JSON-serialized as a string in `valueString`. This is portable and follows FHIR extension conventions.

## Extraction Flow

1. User fills Questionnaire form → submits → QuestionnaireResponse is created (existing flow, unchanged)
2. After QR creation, fetch the referenced Questionnaire to check for an extraction template extension
3. If template exists: run `resolveTemplate(questionnaireResponse, template)` in the browser
4. Create each extracted resource via individual `medplum.createResource()` calls (not a transaction Bundle)
5. Show success notification with clickable links to the created resources

## New Module: `src/fhir/extraction.ts`

Core extraction logic, adapted from beda-software's `resolveTemplate`:

- `resolveTemplate(resource, template, context?)` — evaluates a mapping template against a FHIR resource. Handles FHIRPath expression evaluation (`{{ expr }}`), array expressions (`{[ expr ]}`), control flow (`{% assign %}`, `{% if %}`, `{% for %}`, `{% merge %}`), and auto-cleanup of nulls/empty values.
- `getExtractionTemplate(questionnaire)` — reads the `http://beda.software/fhir-extensions/fhir-path-mapping-language` extension from a Questionnaire, returns parsed template JSON or null.
- `extractResources(questionnaire, questionnaireResponse)` — orchestrates: get template → resolve template with QR as context → return array of FHIR resources to create.

### Dependencies

- `fhirpath` npm package (already used transitively by Medplum; add as direct dependency)
- FHIR R4 model from `fhirpath/fhir-context/r4` for type-aware expression evaluation

## New UI: Extraction Tab on Questionnaire Detail Page

A new "Extraction" tab on the Questionnaire detail page (alongside Details, Edit, JSON, Fill):

### Template Editor
- Mantine `Textarea` with monospace font for editing the mapping template JSON
- Validates JSON on save, shows parse errors inline
- Save button writes the template back to the Questionnaire resource as the extension

### Test Panel
- Dropdown/input to select an existing QuestionnaireResponse for this Questionnaire
- "Test Extraction" button runs the template against the selected QR
- Shows the output resources as formatted JSON preview
- Errors displayed inline

### Save Behavior
- Reads the current Questionnaire, adds/updates the extraction extension, calls `medplum.updateResource()`

## Changes to QuestionnaireFillTab

After successful QR creation (in the `.then()` handler):

1. Fetch the Questionnaire (have the ID from `questionnaire.id` prop already available)
2. Call `getExtractionTemplate(questionnaire)` — if null, skip extraction (existing behavior, just navigate)
3. If template exists, call `extractResources(questionnaire, questionnaireResponse)`
4. For each extracted resource, call `medplum.createResource(resource)`, collect results
5. Show Mantine notification with links to created resources (e.g., "Created Patient/abc-123")
6. Navigate to the QuestionnaireResponse (existing behavior)

## Error Handling

- **Template parsing errors** — Displayed in the Extraction tab editor as red text below the textarea
- **FHIRPath evaluation errors** — Shown as an alert on the QR page after submission. The QR is still saved — extraction failure does not block QR creation.
- **Individual resource creation failures** — Notification shows which resources succeeded and which failed, with error messages

## File Structure

```
src/fhir/extraction.ts          — Core extraction logic (resolveTemplate, getExtractionTemplate, extractResources)
src/fhir/extraction.test.ts     — Tests for extraction logic
src/pages/ExtractionTab.tsx      — Extraction tab UI component
src/pages/ExtractionTab.test.tsx — Tests for Extraction tab
```

## Example

Given the patient registration Questionnaire from the user's example, an extraction template might look like:

```json
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
```

This template, when applied to the QuestionnaireResponse in the user's example, would produce a Patient resource with the extracted name, birthDate, gender, telecom, and identifier fields.

## Out of Scope

- Server-side extraction (could be added later)
- Transaction Bundles for atomic multi-resource creation
- Extraction template authoring wizard / visual builder
- Automatic extraction on QR creation without user having set up a template

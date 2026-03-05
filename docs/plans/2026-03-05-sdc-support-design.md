# SDC Support (Questionnaire Rendering) — Design

## Purpose

Integrate FHIR Structured Data Capture (SDC) into Cinder by embedding the formbox-renderer library to render Questionnaires as interactive forms, save completed forms as QuestionnaireResponse resources, and explore data extraction options.

## Background

### Formbox Renderer

[formbox-renderer](https://healthsamurai.github.io/formbox-renderer/) is a Health Samurai open-source React library for rendering FHIR R4/R5 Questionnaires. Key characteristics:

- **Packages:** `@formbox/renderer` (core), `@formbox/mantine-theme` (Mantine 8 theme — matches Cinder's UI stack), `@formbox/fhir`, `@formbox/theme`, `@formbox/strings`
- **Peer deps:** React 18+, MobX 6, fhirpath, classnames, @lhncbc/ucum-lhc
- **Theme system:** Pluggable themes — the Mantine theme uses `@mantine/core` 8 and `@tabler/icons-react`, both already in Cinder
- **Props:** `questionnaire` (FHIR R4 Questionnaire), `theme`, `fhirVersion` ("r4"/"r5"), `initialResponse`, `onChange`, `onSubmit`, `terminologyServerUrl`, `launchContext`
- **Controlled mode:** Available via `@formbox/renderer/controlled` — allows external state management of form values
- **SDC support:** Active development toward full SDC parity (expressions, calculated values, etc.)

### Current State in Cinder

- Questionnaire and QuestionnaireResponse are **not** in the `RESOURCE_TYPES` list
- No SDC-specific code exists
- All resources use generic Medplum `ResourceForm` for editing and `ResourceDetail` for display
- The routing already supports arbitrary resource types via `/:resourceType/:id`

## Approach Options

### Option A: Dedicated Questionnaire Fill Page (Recommended)

Add a "Fill" tab to the Questionnaire detail page that embeds formbox-renderer. When submitted, create a QuestionnaireResponse resource linked back to the Questionnaire. This is the most natural UX — you browse to a Questionnaire, fill it out, and the response is saved.

**Pros:** Fits existing navigation patterns, clear user flow, minimal new routes
**Cons:** Slightly more complex ResourceDetailPage (conditional tab)

### Option B: Standalone Form Page

New route like `/questionnaire-fill/:questionnaireId` with full-page form rendering. Separate from the resource detail flow.

**Pros:** Clean separation, could support launching from external links
**Cons:** Disconnected from resource browsing, extra routing complexity

### Option C: iframe Embed of formbox-renderer Demo

Use the hosted demo at healthsamurai.github.io as an iframe, passing questionnaire JSON via postMessage.

**Pros:** Zero dependencies, instant setup
**Cons:** No control over UX, can't save responses to FHIR store, no real integration

**Recommendation:** Option A — it leverages existing navigation and maximizes value by keeping everything in the FHIR browsing workflow.

## UI Design

### Questionnaire Detail Page — New "Fill" Tab

When viewing a Questionnaire resource (`/Questionnaire/:id`), add a fourth tab alongside Details/Edit/JSON:

- **Fill** — Renders the questionnaire using formbox-renderer with the Mantine theme
  - Shows the interactive form
  - "Submit" button at the bottom
  - On submit: creates a QuestionnaireResponse resource via `medplum.createResource()`
  - Success: navigates to the new QuestionnaireResponse detail page
  - Error: displays error via `safeErrorMessage()`

### QuestionnaireResponse Detail Page — "View Response" Tab

When viewing a QuestionnaireResponse (`/QuestionnaireResponse/:id`), add a "Response" tab:

- Renders the questionnaire with the response pre-populated (read-only or editable)
- Uses `initialResponse` prop from formbox-renderer
- Requires fetching the referenced Questionnaire resource
- "Update" button to save edits back

### Sidebar Navigation

Add "Questionnaire" and "QuestionnaireResponse" to `RESOURCE_TYPES` in constants.ts so they appear in the sidebar.

## Data Extraction Options

SDC defines several extraction mechanisms to pull structured data from QuestionnaireResponses into other FHIR resources. These are future enhancements to explore:

### 1. Observation-Based Extraction
- Items with `code` mappings automatically generate Observation resources
- Simplest extraction method — each coded answer becomes an Observation
- Supported by marking questionnaire items with observation codes

### 2. Definition-Based Extraction
- Questionnaire items reference FHIR resource element definitions
- Responses map directly to fields on target resources (Condition, Procedure, etc.)
- Uses `definition` extension on questionnaire items

### 3. StructureMap-Based Extraction
- Most powerful: uses FHIR StructureMap to transform QuestionnaireResponse into any resources
- Requires a StructureMap server or client-side implementation
- Most complex but most flexible

### 4. Practical Recommendation for Cinder

**Phase 1 (this ticket):** Plan only — no extraction implementation. Focus on rendering and response saving.

**Phase 2 (future):** Start with observation-based extraction as it's the simplest. Add an "Extract" button on QuestionnaireResponse detail page that:
- Reads the Questionnaire's item codes
- Maps coded answers to Observation resources
- Creates Observations via `medplum.createResource()`
- Links them to the subject from the response

**Phase 3 (future):** Explore definition-based extraction for richer resource generation.

## Technical Design

### New Dependencies

```json
{
  "@formbox/renderer": "^0.3.0",
  "@formbox/mantine-theme": "^0.3.0",
  "mobx": "^6.15.0",
  "mobx-react-lite": "^4.1.1",
  "fhirpath": "^4.6.0",
  "@lhncbc/ucum-lhc": "^7.1.3",
  "classnames": "^2.5.1",
  "mobx-utils": "^6.1.1"
}
```

### QuestionnaireResponse Creation

When the user submits a filled form:

```typescript
const questionnaireResponse: QuestionnaireResponse = {
  resourceType: "QuestionnaireResponse",
  questionnaire: `Questionnaire/${questionnaire.id}`,
  status: "completed",
  authored: new Date().toISOString(),
  item: formboxResponseItems, // from formbox onChange/onSubmit
};

const saved = await medplum.createResource(questionnaireResponse);
navigate(`/QuestionnaireResponse/${saved.id}`);
```

### Terminology Server Integration

Formbox-renderer accepts `terminologyServerUrl` for ValueSet expansion. Cinder already has a two-tier ValueSet expansion (local + tx.fhir.org fallback). We can either:
- Pass `terminologyServerUrl` pointing to Cinder's FHIR proxy (which forwards to GCP)
- Or let formbox use its own default terminology resolution

Recommendation: Pass the proxy URL so terminology goes through the same auth/proxy path.

## Files

### New
- `src/pages/QuestionnaireFillTab.tsx` — Formbox renderer wrapper for filling questionnaires
- `src/pages/QuestionnaireFillTab.test.tsx` — Tests
- `src/pages/QuestionnaireResponseViewTab.tsx` — View/edit a completed response
- `src/pages/QuestionnaireResponseViewTab.test.tsx` — Tests

### Modified
- `src/constants.ts` — Add Questionnaire, QuestionnaireResponse to RESOURCE_TYPES
- `src/pages/ResourceDetailPage.tsx` — Conditionally show "Fill" tab for Questionnaire, "Response" tab for QuestionnaireResponse
- `package.json` / `bun.lock` — New dependencies

## Open Questions

1. **formbox-renderer API stability:** The library is at v0.3.0 (published 2 days ago). Need to verify the onChange/onSubmit callback signatures and how to extract a valid QuestionnaireResponse from the form state.

2. **Controlled vs uncontrolled mode:** Should we use the controlled mode (`@formbox/renderer/controlled`) for tighter integration, or the default uncontrolled mode for simplicity? Recommendation: start uncontrolled, switch if needed.

3. **Subject context:** When filling a questionnaire, should we prompt for a patient/subject? Could add a patient selector before the form, or leave subject blank for standalone forms.

4. **MobX coexistence:** Formbox uses MobX internally. Need to verify it doesn't conflict with Cinder's state management (React state + Medplum context). MobX should be self-contained within formbox.

# Delete Patient Resources — Design

## Purpose

Admin page for deleting FHIR resources associated with a patient. Intended for maintaining demo accounts by selectively removing resource types in bulk.

## UI Flow

### Step 1: Select Patient
- Text input with autocomplete searching patients by name
- Displays patient name + ID once selected

### Step 2: Preview & Select
- Table showing each resource type with its count for the selected patient
- Checkbox per row for selecting which types to delete
- "Select All" toggle
- Types with 0 resources shown but disabled
- "Delete Selected" button (disabled until at least one type checked)

### Step 3: Confirm
- Confirmation modal summarizing total resource count and types
- "Confirm Delete" button to proceed

### Step 4: Progress & Results
- Progress bar tracking deletions
- Per-type success/failure counts
- Cancel button to abort mid-way
- Final summary when complete

## Technical Design

### Patient Search Parameter Mapping

| Search Param  | Resource Types                                                                                      |
|---------------|-----------------------------------------------------------------------------------------------------|
| `subject`     | Observation, Condition, Encounter, MedicationRequest, DiagnosticReport, Procedure, CarePlan, CareTeam, DocumentReference, Goal, ServiceRequest, Specimen |
| `patient`     | AllergyIntolerance, Immunization, Claim, RelatedPerson                                              |
| `beneficiary` | Coverage                                                                                            |

### Counting
- `_summary=count` query per resource type, run in parallel via `Promise.allSettled`

### Deletion
- Fetch resource IDs with `_elements=id&_count=100`, paginate through all pages
- Delete individually via `medplum.deleteResource(type, id)`
- Track progress per type

### Key Decisions
- Individual DELETE calls (no batch) — more reliable with GCP Healthcare API
- Patient resource itself is NOT deleted
- All operations go through existing `/fhir/*` proxy
- Uses `safeErrorMessage()` for error display

## Files

### New
- `src/pages/DeletePatientResourcesPage.tsx` — main page
- `src/pages/DeletePatientResourcesPage.test.tsx` — tests

### Modified
- `src/App.tsx` — add route `/delete-patient-resources`
- `src/Shell.tsx` — add nav link in Admin section

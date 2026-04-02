# Merge Duplicates — Design Spec

## Overview

An admin feature for detecting and merging duplicate FHIR resources. The system uses phonetic name matching (Double Metaphone) to surface potential duplicate groups, lets the user pick which resource to keep, rewrites all references from the duplicates to the primary, deletes the duplicates, and records an AuditEvent.

**Scope for v1:** Resource types with a `name` field — Practitioner, Patient, Organization, RelatedPerson. Starting with Practitioner as the primary use case.

## User Flow

A 6-step single-page wizard at `/merge-duplicates`:

1. **Select Resource Type** — Dropdown filtered to resource types that have a `name` field. Click "Scan for Duplicates."
2. **Review Duplicate Groups** — System fetches all resources of the type, groups by phonetic code (Double Metaphone on family + given names), and shows groups with 2+ matches. Sorted by group size descending.
3. **Select Primary** — User clicks into a group, sees all duplicates with key details (ID, identifiers, phone, last updated). Clicks one to mark as "Keep"; the rest are marked for deletion.
4. **Preview & Confirm** — Shows the primary resource, count of duplicates to delete, and a breakdown of references to rewrite by resource type. Red "Merge & Delete Duplicates" button to confirm.
5. **Execution Progress** — Progress bar with per-resource-type status. Processes one duplicate at a time: rewrite all references, then delete.
6. **Results** — Summary of what was kept, deleted, and updated. Options to "Merge More Duplicates" or "View Kept Resource."

## Architecture

### Single-Page Wizard with Extracted Steps

Follows the pattern established by `DeletePatientResourcesPage` and `BulkLoadPage`. A parent component manages step state; each step is its own component file.

```
src/pages/MergeDuplicates/
├── MergeDuplicatesPage.tsx        # Parent wizard — step state management
├── SelectResourceTypeStep.tsx     # Step 1: resource type dropdown
├── DuplicateGroupsStep.tsx        # Step 2: phonetic match group list
├── SelectPrimaryStep.tsx          # Step 3: pick the keeper
├── PreviewStep.tsx                # Step 4: reference impact + confirm
├── ExecutionStep.tsx              # Step 5: progress bar
├── ResultsStep.tsx                # Step 6: summary
├── duplicateDetection.ts          # Phonetic grouping logic
├── rewriteReferences.ts           # Generalized reference rewriter
└── MergeDuplicatesPage.test.tsx   # Tests
```

### Integration Points

- **Route:** `/merge-duplicates` added to `App.tsx` under the FhirProvider/Shell wrapper
- **Navigation:** New NavLink under Admin section in `Shell.tsx`
- **Dependency:** `double-metaphone` npm package

## Duplicate Detection

1. Fetch all resources of the selected type, paginating through the full list using `_count` + cursor pagination.
2. Extract name fields:
   - For `HumanName` types (Practitioner, Patient, RelatedPerson): extract `family` and `given` names
   - For string `name` types (Organization): use the name string directly
3. Generate Double Metaphone codes for each name component.
4. Group resources by their primary phonetic code. Resources with matching codes are potential duplicates.
5. Filter to groups with 2+ resources. Sort by group size descending.

This catches phonetic variations like "Smith/Smyth", "John/Jon", "Steven/Stephen" while avoiding false positives from exact-match-only approaches.

## Reference Rewriting

### Generalized Reference Rewriter

A new `rewriteReferences(resource, sourceIds: string[], targetId: string, resourceType: string)` function that:

1. Deep-walks the resource JSON tree
2. Finds all `reference` fields matching `{ResourceType}/{sourceId}` for any source ID
3. Replaces with `{ResourceType}/{targetId}`
4. Returns the modified resource (or null if no changes)

This generalizes the existing `rewritePatientReferences.ts` pattern to work with any resource type.

### Reference Discovery

For each duplicate to delete:

1. Search every resource type in `RESOURCE_TYPES` for references to the duplicate. Use FHIR search parameters appropriate to each resource type (e.g., `Encounter?participant=Practitioner/def-456`).
2. For each resource found, apply the reference rewriter.
3. Update the modified resource via `medplum.updateResource()`.
4. After all references are rewritten for a duplicate, delete it via `medplum.deleteResource()`.

### Processing Order

- Duplicates are processed one at a time (not in parallel) to avoid race conditions on shared resources.
- If a reference update fails, execution stops and reports which resources succeeded/failed. No partial deletes — a duplicate is only deleted after all its references are successfully rewritten.

### Reference Search Strategy

To find all resources referencing a given duplicate, we search each resource type in `RESOURCE_TYPES` using a simple full-text approach:

1. For each resource type, search with `_content={ResourceType}/{duplicateId}` — this searches the serialized JSON content for the reference string. GCP Healthcare API supports `_content` as a full-text search param.
2. For each result, apply the reference rewriter to update matching `reference` fields.
3. This avoids needing to know the specific search parameter names for each resource type (e.g., `participant` vs `performer` vs `practitioner`), which vary across resource types.

**Fallback:** If `_content` search isn't sufficient, we can iterate known reference search parameters per resource type. But `_content` is simpler and covers all reference fields regardless of naming.

## Audit Trail

After each successful merge operation, create a FHIR `AuditEvent` resource:

```json
{
  "resourceType": "AuditEvent",
  "type": {
    "system": "http://terminology.hl7.org/CodeSystem/audit-event-type",
    "code": "rest",
    "display": "RESTful Operation"
  },
  "subtype": [{
    "system": "http://cinder.health/audit-event-subtype",
    "code": "merge-duplicates",
    "display": "Merge Duplicate Resources"
  }],
  "action": "U",
  "recorded": "<timestamp>",
  "outcome": "0",
  "agent": [{
    "who": { "display": "<current user>" },
    "requestor": true
  }],
  "entity": [
    {
      "what": { "reference": "<ResourceType>/<kept-id>" },
      "role": { "code": "4", "display": "Domain Resource" },
      "description": "Primary resource (kept)"
    },
    {
      "what": { "reference": "<ResourceType>/<deleted-id>" },
      "role": { "code": "4", "display": "Domain Resource" },
      "description": "Duplicate resource (deleted)"
    }
  ],
  "extension": [{
    "url": "http://cinder.health/fhir/StructureDefinition/merge-summary",
    "extension": [
      { "url": "referencesUpdated", "valueInteger": 23 },
      { "url": "resourceTypesAffected", "valueInteger": 3 }
    ]
  }]
}
```

## Supported Resource Types

v1 supports resource types with a `name` field from `RESOURCE_TYPES`:

| Resource Type | Name Field Type | Name Extraction |
|---|---|---|
| Patient | `HumanName[]` | `family` + `given[]` |
| Practitioner | `HumanName[]` | `family` + `given[]` |
| RelatedPerson | `HumanName[]` | `family` + `given[]` |
| Organization | `string` | Direct string value |

Resource types without a `name` field are excluded from the dropdown in Step 1.

## Error Handling

- **Fetch failures during scan:** Show error alert, allow retry.
- **No duplicates found:** Show informational message, allow switching resource type.
- **Reference update failure:** Stop execution, report which updates succeeded and which failed. Do not delete the duplicate if its references weren't fully rewritten.
- **Delete failure:** Report the error. References have already been rewritten so the duplicate is now unreferenced but still exists — user can manually delete.
- **Network errors during execution:** Show error with option to retry the failed operation.

## UI Components

All UI uses Mantine components:

- `Select` for resource type dropdown
- `Card` / `Paper` for duplicate group cards
- `Table` for reference impact breakdown
- `Progress` for execution progress bar
- `Alert` for success/error states
- `Button` for actions
- `Radio` or click-to-select pattern for picking the primary resource
- `Stack` / `Group` for layout

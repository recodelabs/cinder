// ABOUTME: Defines which search parameters are filterable per FHIR resource type.
// ABOUTME: Maps resource types to user-facing filter configs for the SearchFilterBar.

export interface FilterConfig {
  readonly code: string;
  readonly label: string;
  readonly type: 'text' | 'reference';
}

const filtersByResourceType: Record<string, readonly FilterConfig[]> = {
  Patient: [
    { code: 'name', label: 'Name', type: 'text' },
    { code: '_id', label: 'ID', type: 'text' },
  ],
  Observation: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'code', label: 'Code', type: 'text' },
    { code: 'status', label: 'Status', type: 'text' },
  ],
  Condition: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'code', label: 'Code', type: 'text' },
  ],
  Encounter: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'type', label: 'Type', type: 'text' },
  ],
  MedicationRequest: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'status', label: 'Status', type: 'text' },
  ],
  DiagnosticReport: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'code', label: 'Code', type: 'text' },
    { code: 'status', label: 'Status', type: 'text' },
  ],
  Procedure: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'code', label: 'Code', type: 'text' },
    { code: 'status', label: 'Status', type: 'text' },
  ],
  AllergyIntolerance: [
    { code: 'patient', label: 'Patient', type: 'reference' },
    { code: 'code', label: 'Code', type: 'text' },
  ],
  Immunization: [
    { code: 'patient', label: 'Patient', type: 'reference' },
    { code: 'vaccine-code', label: 'Vaccine Code', type: 'text' },
  ],
  CarePlan: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'status', label: 'Status', type: 'text' },
  ],
  CareTeam: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'status', label: 'Status', type: 'text' },
  ],
  Claim: [
    { code: 'patient', label: 'Patient', type: 'reference' },
    { code: 'status', label: 'Status', type: 'text' },
  ],
  Coverage: [
    { code: 'beneficiary', label: 'Patient', type: 'reference' },
    { code: 'status', label: 'Status', type: 'text' },
  ],
  DocumentReference: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'type', label: 'Type', type: 'text' },
  ],
  Goal: [
    { code: 'subject', label: 'Patient', type: 'reference' },
  ],
  ServiceRequest: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'code', label: 'Code', type: 'text' },
    { code: 'status', label: 'Status', type: 'text' },
  ],
  RelatedPerson: [
    { code: 'patient', label: 'Patient', type: 'reference' },
  ],
  Specimen: [
    { code: 'subject', label: 'Patient', type: 'reference' },
    { code: 'type', label: 'Type', type: 'text' },
  ],
};

const EMPTY_FILTERS: readonly FilterConfig[] = [];

export function getFiltersForResourceType(resourceType: string): readonly FilterConfig[] {
  return filtersByResourceType[resourceType] ?? EMPTY_FILTERS;
}

/**
 * Formats a reference filter value. If the user enters a bare ID (no slash),
 * prepends "Patient/" automatically.
 */
export function formatReferenceValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('/')) return trimmed;
  return `Patient/${trimmed}`;
}

// ABOUTME: Default search configurations per FHIR resource type.
// ABOUTME: Maps resource types to their most useful columns, sort order, and page size.
import type { SearchRequest } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';

export function getDefaultSearch(resourceType: string): SearchRequest {
  return {
    resourceType: resourceType as ResourceType,
    fields: getDefaultFields(resourceType),
    sortRules: [{ code: '_lastUpdated', descending: true }],
    count: 20,
  };
}

function getDefaultFields(resourceType: string): string[] {
  switch (resourceType) {
    case 'Patient':
      return ['name', 'birthdate', 'gender'];
    case 'Practitioner':
      return ['name', 'birthdate', 'gender'];
    case 'Organization':
      return ['name'];
    case 'Encounter':
      return ['subject', 'period', 'type'];
    case 'Observation':
      return ['subject', 'code', 'value-quantity', 'status'];
    case 'Condition':
      return ['subject', 'code', 'clinical-status'];
    case 'MedicationRequest':
      return ['subject', 'medication', 'status'];
    case 'DiagnosticReport':
      return ['subject', 'code', 'status'];
    case 'Procedure':
      return ['subject', 'code', 'status'];
    case 'AllergyIntolerance':
      return ['patient', 'code', 'clinical-status'];
    case 'Immunization':
      return ['patient', 'vaccine-code', 'date'];
    case 'CarePlan':
      return ['subject', 'category', 'status'];
    case 'CareTeam':
      return ['subject', 'status'];
    case 'Claim':
      return ['patient', 'status', 'created'];
    case 'Coverage':
      return ['beneficiary', 'status'];
    case 'DocumentReference':
      return ['subject', 'type', 'date'];
    case 'Goal':
      return ['subject', 'lifecycle-status'];
    case 'Location':
      return ['name', 'address'];
    case 'Medication':
      return ['code', 'status'];
    case 'ServiceRequest':
      return ['subject', 'code', 'status'];
    case 'Specimen':
      return ['subject', 'type', 'status'];
    default:
      return ['_lastUpdated'];
  }
}

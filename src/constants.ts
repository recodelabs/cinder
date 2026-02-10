// ABOUTME: Shared constants used across the application.
// ABOUTME: Defines the list of FHIR resource types available in the sidebar and home page.

export const RESOURCE_TYPES = [
  'Patient',
  'Practitioner',
  'Organization',
  'Encounter',
  'Observation',
  'Condition',
  'Procedure',
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

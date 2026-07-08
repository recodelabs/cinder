// ABOUTME: Shared constants used across the application.
// ABOUTME: Defines the list of FHIR resource types available in the sidebar and home page.

export const RESOURCE_TYPES = [
  'Patient',
  'Practitioner',
  'PractitionerRole',
  'Organization',
  'Encounter',
  'Observation',
  'Condition',
  'Procedure',
  'Questionnaire',
  'QuestionnaireResponse',
  'RelatedPerson',
  'MedicationRequest',
  'MedicationStatement',
  'AllergyIntolerance',
  'Appointment',
  'Immunization',
  'DiagnosticReport',
  'CarePlan',
  'CareTeam',
  'Claim',
  'CodeSystem',
  'Coverage',
  'DocumentReference',
  'Goal',
  'Group',
  'Location',
  'MeasureReport',
  'Medication',
  'MedicationAdministration',
  'PlanDefinition',
  'ServiceRequest',
  'Specimen',
  'SupplyDelivery',
  'Task',
] as const;

/**
 * Resource types that support duplicate detection via name matching.
 * These types have a `name` field (HumanName[] or string).
 */
export const MERGEABLE_RESOURCE_TYPES = [
  'Patient',
  'Practitioner',
  'RelatedPerson',
  'Organization',
] as const;

// ABOUTME: Tests that FHIR schemas load correctly at startup.
// ABOUTME: Verifies StructureDefinitions and SearchParameters are indexed.
import { getDataType } from '@medplum/core';
import { describe, expect, it } from 'vitest';
import { loadSchemas } from './schemas';

describe('Schema loading', () => {
  it('loads Patient StructureDefinition', () => {
    loadSchemas();
    const patient = getDataType('Patient');
    expect(patient).toBeDefined();
    expect(patient.elements).toBeDefined();
  });

  it('loads Observation StructureDefinition', () => {
    loadSchemas();
    const obs = getDataType('Observation');
    expect(obs).toBeDefined();
  });
});

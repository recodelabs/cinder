// ABOUTME: Tests for default search configurations per FHIR resource type.
// ABOUTME: Verifies each resource type returns appropriate column defaults.
import { describe, expect, it } from 'vitest';
import { getDefaultSearch } from './search-defaults';

describe('getDefaultSearch', () => {
  it('returns patient, relationship, and _lastUpdated for RelatedPerson', () => {
    const search = getDefaultSearch('RelatedPerson');
    expect(search.fields).toEqual(['patient', 'relationship', '_lastUpdated']);
  });

  it('returns default fields for unknown resource types', () => {
    const search = getDefaultSearch('UnknownType');
    expect(search.fields).toEqual(['_lastUpdated']);
  });

  it('returns expected fields for Patient', () => {
    const search = getDefaultSearch('Patient');
    expect(search.fields).toEqual(['_id', 'name', 'birthdate', 'gender', '_lastUpdated']);
  });
});

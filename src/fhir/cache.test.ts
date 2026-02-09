// ABOUTME: Tests for the FHIR reference resolution cache.
// ABOUTME: Verifies caching, eviction, and reference resolution.
import { describe, expect, it } from 'vitest';
import { ReferenceCache } from './cache';
import type { Patient } from '@medplum/fhirtypes';

describe('ReferenceCache', () => {
  it('stores and retrieves resources', () => {
    const cache = new ReferenceCache(100);
    const patient: Patient = { resourceType: 'Patient', id: '123' };
    cache.set('Patient/123', patient);
    expect(cache.get('Patient/123')).toBe(patient);
  });

  it('returns undefined for unknown references', () => {
    const cache = new ReferenceCache(100);
    expect(cache.get('Patient/unknown')).toBeUndefined();
  });

  it('evicts oldest entries when full', () => {
    const cache = new ReferenceCache(2);
    cache.set('Patient/1', { resourceType: 'Patient', id: '1' });
    cache.set('Patient/2', { resourceType: 'Patient', id: '2' });
    cache.set('Patient/3', { resourceType: 'Patient', id: '3' });

    expect(cache.get('Patient/1')).toBeUndefined();
    expect(cache.get('Patient/3')).toBeDefined();
  });
});

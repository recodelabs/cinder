// ABOUTME: Tests for duplicate detection logic — name extraction and phonetic grouping.
// ABOUTME: Verifies Double Metaphone phonetic matching groups similar names correctly.
import { describe, expect, it } from 'vitest';
import type { Organization, Practitioner } from '@medplum/fhirtypes';
import { extractDisplayName, groupByPhoneticCode } from './duplicateDetection';

describe('extractDisplayName', () => {
  it('extracts family + given from HumanName', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: '1',
      name: [{ family: 'Smith', given: ['John'] }],
    };
    expect(extractDisplayName(practitioner)).toBe('Smith John');
  });

  it('extracts string name from Organization', () => {
    const org: Organization = {
      resourceType: 'Organization',
      id: '1',
      name: 'Acme Health',
    };
    expect(extractDisplayName(org)).toBe('Acme Health');
  });

  it('returns empty string when no name', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: '1',
    };
    expect(extractDisplayName(practitioner)).toBe('');
  });

  it('uses first name entry for HumanName array', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: '1',
      name: [
        { family: 'Smith', given: ['John'], use: 'official' },
        { family: 'Smithy', given: ['Johnny'], use: 'nickname' },
      ],
    };
    expect(extractDisplayName(practitioner)).toBe('Smith John');
  });
});

describe('groupByPhoneticCode', () => {
  it('groups practitioners with phonetically similar names', () => {
    const resources: Practitioner[] = [
      { resourceType: 'Practitioner', id: '1', name: [{ family: 'Smith', given: ['John'] }] },
      { resourceType: 'Practitioner', id: '2', name: [{ family: 'Smyth', given: ['Jon'] }] },
      { resourceType: 'Practitioner', id: '3', name: [{ family: 'Jones', given: ['Alice'] }] },
    ];
    const groups = groupByPhoneticCode(resources);
    const smithGroup = groups.find((g) => g.resources.some((r) => r.id === '1'));
    expect(smithGroup).toBeDefined();
    expect(smithGroup!.resources).toHaveLength(2);
    expect(smithGroup!.resources.map((r) => r.id).sort()).toEqual(['1', '2']);
  });

  it('filters out groups with only one resource', () => {
    const resources: Practitioner[] = [
      { resourceType: 'Practitioner', id: '1', name: [{ family: 'Smith', given: ['John'] }] },
      { resourceType: 'Practitioner', id: '2', name: [{ family: 'Jones', given: ['Alice'] }] },
    ];
    const groups = groupByPhoneticCode(resources);
    expect(groups).toHaveLength(0);
  });

  it('sorts groups by size descending', () => {
    const resources: Practitioner[] = [
      { resourceType: 'Practitioner', id: '1', name: [{ family: 'Smith', given: ['John'] }] },
      { resourceType: 'Practitioner', id: '2', name: [{ family: 'Smyth', given: ['Jon'] }] },
      { resourceType: 'Practitioner', id: '3', name: [{ family: 'Johnson', given: ['Bob'] }] },
      { resourceType: 'Practitioner', id: '4', name: [{ family: 'Jonson', given: ['Bob'] }] },
      { resourceType: 'Practitioner', id: '5', name: [{ family: 'Johnsen', given: ['Bob'] }] },
    ];
    const groups = groupByPhoneticCode(resources);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1]!.resources.length).toBeGreaterThanOrEqual(groups[i]!.resources.length);
    }
  });

  it('skips resources with no name', () => {
    const resources: Practitioner[] = [
      { resourceType: 'Practitioner', id: '1', name: [{ family: 'Smith', given: ['John'] }] },
      { resourceType: 'Practitioner', id: '2' },
      { resourceType: 'Practitioner', id: '3', name: [{ family: 'Smyth', given: ['Jon'] }] },
    ];
    const groups = groupByPhoneticCode(resources);
    const smithGroup = groups.find((g) => g.resources.some((r) => r.id === '1'));
    expect(smithGroup).toBeDefined();
    expect(smithGroup!.resources).toHaveLength(2);
  });
});

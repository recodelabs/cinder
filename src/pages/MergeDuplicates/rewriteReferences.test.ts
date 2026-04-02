// ABOUTME: Tests for the generalized FHIR reference rewriter.
// ABOUTME: Verifies deep-walk replacement of reference fields for any resource type.
import { describe, expect, it } from 'vitest';
import type { Encounter, Observation } from '@medplum/fhirtypes';
import { rewriteReferences } from './rewriteReferences';

describe('rewriteReferences', () => {
  it('rewrites a top-level participant reference', () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'finished',
      class: { code: 'AMB' },
      participant: [
        {
          individual: { reference: 'Practitioner/old-id' },
        },
      ],
    };
    const result = rewriteReferences(encounter, ['old-id'], 'keep-id', 'Practitioner');
    expect((result as Encounter).participant?.[0]?.individual?.reference).toBe(
      'Practitioner/keep-id'
    );
  });

  it('rewrites nested references in arrays', () => {
    const obs: Observation = {
      resourceType: 'Observation',
      id: 'obs-1',
      status: 'final',
      code: { text: 'test' },
      performer: [{ reference: 'Practitioner/dup-1' }, { reference: 'Practitioner/other' }],
    };
    const result = rewriteReferences(obs, ['dup-1'], 'keep-id', 'Practitioner');
    const performers = (result as Observation).performer!;
    expect(performers[0]?.reference).toBe('Practitioner/keep-id');
    expect(performers[1]?.reference).toBe('Practitioner/other');
  });

  it('returns null when no references match', () => {
    const obs: Observation = {
      resourceType: 'Observation',
      id: 'obs-1',
      status: 'final',
      code: { text: 'test' },
      performer: [{ reference: 'Practitioner/no-match' }],
    };
    const result = rewriteReferences(obs, ['dup-1'], 'keep-id', 'Practitioner');
    expect(result).toBeNull();
  });

  it('does not mutate the original resource', () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'finished',
      class: { code: 'AMB' },
      participant: [
        {
          individual: { reference: 'Practitioner/old-id' },
        },
      ],
    };
    rewriteReferences(encounter, ['old-id'], 'keep-id', 'Practitioner');
    expect(encounter.participant![0]!.individual!.reference).toBe('Practitioner/old-id');
  });

  it('rewrites multiple source IDs to the same target', () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'finished',
      class: { code: 'AMB' },
      participant: [
        { individual: { reference: 'Practitioner/dup-1' } },
        { individual: { reference: 'Practitioner/dup-2' } },
      ],
    };
    const result = rewriteReferences(encounter, ['dup-1', 'dup-2'], 'keep-id', 'Practitioner');
    const participants = (result as Encounter).participant!;
    expect(participants[0]?.individual?.reference).toBe('Practitioner/keep-id');
    expect(participants[1]?.individual?.reference).toBe('Practitioner/keep-id');
  });
});

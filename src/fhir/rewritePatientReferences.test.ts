// ABOUTME: Tests for the patient reference rewriting utility.
// ABOUTME: Verifies deep-walk replacement of Patient references in various formats.
import type { Resource } from '@medplum/fhirtypes';
import { describe, expect, it } from 'vitest';
import { extractPatientIds, rewritePatientReferences } from './rewritePatientReferences';

describe('rewritePatientReferences', () => {
  it('replaces subject.reference with Patient/id format', () => {
    const resource = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/old-id' },
    } as Resource;

    const result = rewritePatientReferences(resource, ['old-id'], 'new-id');

    expect((result as Record<string, unknown> & { subject: { reference: string } }).subject.reference).toBe(
      'Patient/new-id'
    );
  });

  it('replaces urn:uuid: references', () => {
    const resource = {
      resourceType: 'Condition',
      subject: { reference: 'urn:uuid:abc-123' },
    } as Resource;

    const result = rewritePatientReferences(resource, ['abc-123'], 'target-456');

    expect((result as Record<string, unknown> & { subject: { reference: string } }).subject.reference).toBe(
      'Patient/target-456'
    );
  });

  it('replaces nested references deep in the resource', () => {
    const resource = {
      resourceType: 'Encounter',
      subject: { reference: 'Patient/old-id' },
      participant: [
        {
          individual: { reference: 'Practitioner/doc-1' },
        },
      ],
      serviceProvider: { reference: 'Organization/org-1' },
    } as Resource;

    const result = rewritePatientReferences(resource, ['old-id'], 'new-id') as Record<string, unknown>;
    const subject = result.subject as { reference: string };
    expect(subject.reference).toBe('Patient/new-id');
    // Non-patient references should be untouched
    const participant = result.participant as Array<{ individual: { reference: string } }>;
    expect(participant[0]!.individual.reference).toBe('Practitioner/doc-1');
  });

  it('handles multiple source patient IDs', () => {
    const resource = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/id-1' },
    } as Resource;

    const result = rewritePatientReferences(resource, ['id-1', 'id-2'], 'target');

    expect((result as Record<string, unknown> & { subject: { reference: string } }).subject.reference).toBe(
      'Patient/target'
    );
  });

  it('does not modify non-patient references', () => {
    const resource = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/old-id' },
      performer: [{ reference: 'Practitioner/doc-1' }],
    } as Resource;

    const result = rewritePatientReferences(resource, ['old-id'], 'new-id') as Record<string, unknown>;
    const performer = result.performer as Array<{ reference: string }>;
    expect(performer[0]!.reference).toBe('Practitioner/doc-1');
  });

  it('returns resource unchanged when no source IDs provided', () => {
    const resource = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/some-id' },
    } as Resource;

    const result = rewritePatientReferences(resource, [], 'target');

    expect(result).toBe(resource); // Same reference, no copy
  });

  it('does not mutate the original resource', () => {
    const resource = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/old-id' },
    } as Resource;

    rewritePatientReferences(resource, ['old-id'], 'new-id');

    expect((resource as Record<string, unknown> & { subject: { reference: string } }).subject.reference).toBe(
      'Patient/old-id'
    );
  });
});

describe('extractPatientIds', () => {
  it('extracts id from Patient resources', () => {
    const resources = [
      { resourceType: 'Patient', id: 'p-123' } as Resource,
      { resourceType: 'Observation', id: 'obs-1' } as Resource,
    ];

    const ids = extractPatientIds(resources, new Map());
    expect(ids).toEqual(['p-123']);
  });

  it('extracts urn:uuid: from fullUrls map', () => {
    const patient = { resourceType: 'Patient', id: 'p-123' } as Resource;
    const resources = [patient];
    const fullUrls = new Map<Resource, string>([[patient, 'urn:uuid:uuid-456']]);

    const ids = extractPatientIds(resources, fullUrls);
    expect(ids).toContain('p-123');
    expect(ids).toContain('uuid-456');
  });

  it('returns empty array when no patients', () => {
    const resources = [{ resourceType: 'Observation', id: 'obs-1' } as Resource];
    const ids = extractPatientIds(resources, new Map());
    expect(ids).toEqual([]);
  });
});

// ABOUTME: Tests for extraction orchestration helpers.
// ABOUTME: Covers reading templates from Questionnaire extensions and running extraction.
import { describe, expect, it } from 'vitest';
import { getExtractionTemplate, runExtraction, EXTRACTION_EXTENSION_URL } from './extraction-helpers';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';

describe('getExtractionTemplate', () => {
  it('returns null when no extraction extension exists', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    expect(getExtractionTemplate(q)).toBeNull();
  });

  it('returns parsed template array from extension', () => {
    const template = [{ resourceType: 'Patient', name: "{{ QuestionnaireResponse.item.first().answer.valueString }}" }];
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [
        { url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) },
      ],
    };
    expect(getExtractionTemplate(q)).toEqual(template);
  });

  it('returns null for invalid JSON in extension', () => {
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [
        { url: EXTRACTION_EXTENSION_URL, valueString: 'not json{' },
      ],
    };
    expect(getExtractionTemplate(q)).toBeNull();
  });
});

describe('runExtraction', () => {
  it('resolves a single-resource template', () => {
    const template = [{ resourceType: 'Patient', birthDate: "{{ QuestionnaireResponse.item.where(linkId='dob').answer.valueDate }}" }];
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [{ url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) }],
    };
    const qr: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [{ linkId: 'dob', answer: [{ valueDate: '1990-01-01' }] }],
    };
    const result = runExtraction(q, qr);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ resourceType: 'Patient', birthDate: '1990-01-01' });
  });

  it('returns empty array when no template configured', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    const qr: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed' };
    expect(runExtraction(q, qr)).toEqual([]);
  });

  it('filters out null results from templates', () => {
    const template = [
      { resourceType: 'Patient', name: "{{ QuestionnaireResponse.item.where(linkId='missing').answer.valueString }}" },
    ];
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [{ url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) }],
    };
    const qr: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed' };
    expect(runExtraction(q, qr)).toEqual([]);
  });
});

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

describe('patient registration extraction', () => {
  it('extracts a Patient from a patient registration QR', () => {
    const template = [
      {
        resourceType: 'Patient',
        name: [{
          given: ["{{ QuestionnaireResponse.item.where(linkId='name').item.where(linkId='name.given').answer.valueString }}"],
          family: "{{ QuestionnaireResponse.item.where(linkId='name').item.where(linkId='name.family').answer.valueString }}",
        }],
        birthDate: "{{ QuestionnaireResponse.item.where(linkId='birthDate').answer.valueDate }}",
        gender: "{{ QuestionnaireResponse.item.where(linkId='gender').answer.valueCoding.code }}",
        telecom: [
          {
            "{% if QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.phone').answer.valueString.exists() %}": {
              system: 'phone',
              value: "{{ QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.phone').answer.valueString }}",
            },
          },
          {
            "{% if QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.email').answer.valueString.exists() %}": {
              system: 'email',
              value: "{{ QuestionnaireResponse.item.where(linkId='telecom').item.where(linkId='telecom.email').answer.valueString }}",
            },
          },
        ],
        identifier: [{
          "{% if QuestionnaireResponse.item.where(linkId='identifier').answer.valueString.exists() %}": {
            value: "{{ QuestionnaireResponse.item.where(linkId='identifier').answer.valueString }}",
          },
        }],
      },
    ];

    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [{ url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) }],
    };

    const qr: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'name',
          text: 'Name',
          item: [
            { linkId: 'name.given', text: 'Given Name', answer: [{ valueString: 'Asa' }] },
            { linkId: 'name.family', text: 'Family Name', answer: [{ valueString: 'Berg' }] },
          ],
        },
        { linkId: 'birthDate', text: 'Date of Birth', answer: [{ valueDate: '2026-03-03' }] },
        {
          linkId: 'gender',
          text: 'Administrative Gender',
          answer: [{ valueCoding: { system: 'http://hl7.org/fhir/administrative-gender', code: 'female', display: 'Female' } }],
        },
        {
          linkId: 'telecom',
          text: 'Contact',
          item: [
            { linkId: 'telecom.phone', text: 'Phone Number', answer: [{ valueString: '911' }] },
            { linkId: 'telecom.email', text: 'Email Address', answer: [{ valueString: 'joe@blow.com' }] },
          ],
        },
        { linkId: 'identifier', text: 'National ID', answer: [{ valueString: '5544' }] },
      ],
    };

    const result = runExtraction(q, qr);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      resourceType: 'Patient',
      name: [{ given: ['Asa'], family: 'Berg' }],
      birthDate: '2026-03-03',
      gender: 'female',
      telecom: [
        { system: 'phone', value: '911' },
        { system: 'email', value: 'joe@blow.com' },
      ],
      identifier: [{ value: '5544' }],
    });
  });
});

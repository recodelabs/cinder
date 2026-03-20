// ABOUTME: Tests for the FHIRPath Mapping Language template resolution engine.
// ABOUTME: Covers value interpolation, conditionals, loops, cleanup, and error handling.
import { describe, expect, it } from 'vitest';
import { resolveTemplate } from './extraction';

describe('resolveTemplate', () => {
  describe('value interpolation', () => {
    it('interpolates a simple string expression', () => {
      const resource = { resourceType: 'Patient', name: [{ given: ['John'] }] };
      const template = { greeting: "{{ Patient.name.first().given.first() }}" };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({ greeting: 'John' });
    });

    it('returns null for missing values and cleans up', () => {
      const resource = { resourceType: 'Patient' };
      const template = { phone: "{{ Patient.telecom.where(system='phone').value }}" };
      const result = resolveTemplate(resource, template);
      expect(result).toBeNull();
    });

    it('interpolates array expressions with {[ ]}', () => {
      const resource = {
        resourceType: 'QuestionnaireResponse',
        item: [
          { linkId: 'a', answer: [{ valueString: 'one' }] },
          { linkId: 'b', answer: [{ valueString: 'two' }] },
        ],
      };
      const template = {
        values: "{[ QuestionnaireResponse.item.answer.valueString ]}",
      };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({ values: ['one', 'two'] });
    });
  });

  describe('conditionals', () => {
    it('includes block when condition is truthy', () => {
      const resource = { resourceType: 'Patient', active: true };
      const template = {
        "{% if Patient.active %}": { status: "active" },
      };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({ status: 'active' });
    });

    it('removes block when condition is falsy', () => {
      const resource = { resourceType: 'Patient' };
      const template = {
        "{% if Patient.active %}": { status: "active" },
      };
      const result = resolveTemplate(resource, template);
      expect(result).toBeNull();
    });

    it('uses else branch when condition is falsy', () => {
      const resource = { resourceType: 'Patient' };
      const template = {
        "{% if Patient.active %}": { status: "active" },
        "{% else %}": { status: "unknown" },
      };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({ status: 'unknown' });
    });

    it('merges if result into surrounding object', () => {
      const resource = { resourceType: 'Patient', active: true };
      const template = {
        resourceType: "Patient",
        "{% if Patient.active %}": { status: "active" },
      };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({ resourceType: 'Patient', status: 'active' });
    });
  });

  describe('for loops', () => {
    it('iterates over array', () => {
      const resource = {
        resourceType: 'QuestionnaireResponse',
        item: [
          { linkId: 'a', answer: [{ valueString: 'x' }] },
          { linkId: 'b', answer: [{ valueString: 'y' }] },
        ],
      };
      const template = {
        answers: [
          {
            "{% for item in QuestionnaireResponse.item %}": {
              id: "{{ %item.linkId }}",
              value: "{{ %item.answer.valueString }}",
            },
          },
        ],
      };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({
        answers: [
          { id: 'a', value: 'x' },
          { id: 'b', value: 'y' },
        ],
      });
    });
  });

  describe('assign', () => {
    it('binds variables for use in template', () => {
      const resource = { resourceType: 'Patient', name: [{ given: ['Jane'] }] };
      const template = {
        "{% assign %}": { firstName: "{{ Patient.name.first().given.first() }}" },
        greeting: "{{ %firstName }}",
      };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({ greeting: 'Jane' });
    });
  });

  describe('merge', () => {
    it('merges multiple objects', () => {
      const resource = { resourceType: 'Patient', name: [{ given: ['A'] }], birthDate: '2000-01-01' };
      const template = {
        "{% merge %}": [
          { givenName: "{{ Patient.name.first().given.first() }}" },
          { dob: "{{ Patient.birthDate }}" },
        ],
      };
      const result = resolveTemplate(resource, template);
      expect(result).toEqual({ givenName: 'A', dob: '2000-01-01' });
    });
  });

  describe('auto-cleanup', () => {
    it('removes empty objects', () => {
      const resource = { resourceType: 'Patient' };
      const template = {
        name: { given: "{{ Patient.name.given }}" },
      };
      const result = resolveTemplate(resource, template);
      expect(result).toBeNull();
    });

    it('removes empty arrays', () => {
      const resource = { resourceType: 'Patient' };
      const template = {
        names: ["{{ Patient.name.given }}"],
      };
      const result = resolveTemplate(resource, template);
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('throws FPMLValidationError for invalid expressions', () => {
      const resource = { resourceType: 'Patient' };
      const template = { bad: "{{ %%%invalid%%% }}" };
      expect(() => resolveTemplate(resource, template)).toThrow();
    });
  });
});

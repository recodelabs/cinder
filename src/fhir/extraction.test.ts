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
});

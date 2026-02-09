// ABOUTME: Tests for local ValueSet expansion from bundled FHIR definitions.
// ABOUTME: Verifies expansion of common administrative ValueSets without a server.
import { describe, expect, it, beforeAll } from 'vitest';
import { expandValueSet } from './valuesets';
import { loadSchemas } from '../schemas';

beforeAll(() => {
  loadSchemas();
});

describe('expandValueSet', () => {
  it('expands administrative-gender', () => {
    const result = expandValueSet('http://hl7.org/fhir/ValueSet/administrative-gender');
    expect(result).toBeDefined();
    expect(result!.resourceType).toBe('ValueSet');
    expect(result!.expansion?.contains).toBeDefined();
    const codes = result!.expansion!.contains!.map((c) => c.code);
    expect(codes).toContain('male');
    expect(codes).toContain('female');
    expect(codes).toContain('other');
    expect(codes).toContain('unknown');
  });

  it('expands contact-point-system', () => {
    const result = expandValueSet('http://hl7.org/fhir/ValueSet/contact-point-system');
    expect(result).toBeDefined();
    const codes = result!.expansion!.contains!.map((c) => c.code);
    expect(codes).toContain('phone');
    expect(codes).toContain('email');
  });

  it('expands marital-status from v3 codesystem', () => {
    const result = expandValueSet('http://hl7.org/fhir/ValueSet/marital-status');
    expect(result).toBeDefined();
    const codes = result!.expansion!.contains!.map((c) => c.code);
    expect(codes).toContain('M');
    expect(codes).toContain('S');
    expect(codes).toContain('D');
  });

  it('filters by text when filter is provided', () => {
    const result = expandValueSet('http://hl7.org/fhir/ValueSet/administrative-gender', 'fem');
    expect(result).toBeDefined();
    const codes = result!.expansion!.contains!.map((c) => c.code);
    expect(codes).toContain('female');
    expect(codes).not.toContain('male');
  });

  it('returns undefined for unknown ValueSet', () => {
    const result = expandValueSet('http://example.com/unknown');
    expect(result).toBeUndefined();
  });
});

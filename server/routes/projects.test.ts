// ABOUTME: Unit tests for project route utility functions.
// ABOUTME: Tests slugify and validateProjectInput without requiring a database connection.
import { describe, it, expect } from 'vitest';
import { projectTargetColumns, slugify, validateProjectInput } from './project-validation';

describe('slugify', () => {
  it('converts name to lowercase slug', () => {
    expect(slugify('My Project')).toBe('my-project');
  });

  it('removes special characters', () => {
    expect(slugify('Hello World! @#$%')).toBe('hello-world');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('foo---bar')).toBe('foo-bar');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('--hello--')).toBe('hello');
  });
});

describe('validateProjectInput', () => {
  const validInput = {
    name: 'Test Project',
    gcpProject: 'my-project',
    gcpLocation: 'us-central1',
    gcpDataset: 'my-dataset',
    gcpFhirStore: 'my-store',
  };

  it('accepts valid input', () => {
    const result = validateProjectInput(validInput);
    expect(result.name).toBe('Test Project');
    expect(result.gcpProject).toBe('my-project');
  });

  it('accepts valid input with optional fields', () => {
    const result = validateProjectInput({
      ...validInput,
      slug: 'custom-slug',
      description: 'A test project',
    });
    expect(result.slug).toBe('custom-slug');
    expect(result.description).toBe('A test project');
  });

  it('rejects missing name', () => {
    const { name: _, ...withoutName } = validInput;
    expect(() => validateProjectInput(withoutName)).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => validateProjectInput({ ...validInput, name: '' })).toThrow();
  });

  it('rejects missing gcpProject', () => {
    const { gcpProject: _, ...withoutGcpProject } = validInput;
    expect(() => validateProjectInput(withoutGcpProject)).toThrow();
  });

  it('rejects missing gcpLocation', () => {
    const { gcpLocation: _, ...withoutGcpLocation } = validInput;
    expect(() => validateProjectInput(withoutGcpLocation)).toThrow();
  });
});

describe('validateProjectInput for generic FHIR servers', () => {
  it('accepts a FHIR server project with a normalized base URL', () => {
    const result = validateProjectInput({
      name: 'Local HAPI',
      serverType: 'fhir',
      fhirBaseUrl: 'http://localhost:3447/fhir/',
    });
    expect(result.serverType).toBe('fhir');
    if (result.serverType === 'fhir') {
      expect(result.fhirBaseUrl).toBe('http://localhost:3447/fhir');
    }
  });

  it('defaults a legacy payload without serverType to gcp', () => {
    const result = validateProjectInput({
      name: 'Legacy',
      gcpProject: 'p',
      gcpLocation: 'l',
      gcpDataset: 'd',
      gcpFhirStore: 's',
    });
    expect(result.serverType).toBe('gcp');
  });

  it('rejects a FHIR server project without a valid http(s) URL', () => {
    expect(() => validateProjectInput({ name: 'x', serverType: 'fhir', fhirBaseUrl: 'localhost:3447' })).toThrow();
    expect(() => validateProjectInput({ name: 'x', serverType: 'fhir', fhirBaseUrl: 'ftp://h/fhir' })).toThrow();
    expect(() => validateProjectInput({ name: 'x', serverType: 'fhir' })).toThrow();
  });

  it('rejects a gcp project that only supplies a FHIR base URL', () => {
    expect(() => validateProjectInput({ name: 'x', serverType: 'gcp', fhirBaseUrl: 'http://h/fhir' })).toThrow();
  });

  it('ignores GCP fields on a FHIR server project', () => {
    const result = validateProjectInput({
      name: 'x',
      serverType: 'fhir',
      fhirBaseUrl: 'http://localhost:3447/fhir',
      gcpProject: '',
    });
    expect('gcpProject' in result).toBe(false);
  });
});

describe('projectTargetColumns', () => {
  it('nulls GCP columns for FHIR server projects', () => {
    const cols = projectTargetColumns({ name: 'x', serverType: 'fhir', fhirBaseUrl: 'http://localhost:3447/fhir' });
    expect(cols).toEqual({
      serverType: 'fhir',
      fhirBaseUrl: 'http://localhost:3447/fhir',
      gcpProject: null,
      gcpLocation: null,
      gcpDataset: null,
      gcpFhirStore: null,
    });
  });

  it('nulls the base URL for GCP projects', () => {
    const cols = projectTargetColumns({
      name: 'x',
      serverType: 'gcp',
      gcpProject: 'p',
      gcpLocation: 'l',
      gcpDataset: 'd',
      gcpFhirStore: 's',
    });
    expect(cols.serverType).toBe('gcp');
    expect(cols.fhirBaseUrl).toBeNull();
    expect(cols.gcpFhirStore).toBe('s');
  });
});

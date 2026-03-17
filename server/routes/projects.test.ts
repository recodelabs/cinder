// ABOUTME: Unit tests for project route utility functions.
// ABOUTME: Tests slugify and validateProjectInput without requiring a database connection.
import { describe, it, expect } from 'vitest';
import { slugify, validateProjectInput } from './project-validation';

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

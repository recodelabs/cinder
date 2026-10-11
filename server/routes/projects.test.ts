// ABOUTME: Unit tests for project route utility functions.
// ABOUTME: Tests slugify, validateProjectInput, and client-credential update rules without requiring a database connection.
import { describe, it, expect } from 'vitest';
import { planFhirCredential, projectTargetColumns, slugify, validateProjectInput } from './project-validation';

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

describe('validateProjectInput with client credentials', () => {
  const gateway = {
    name: 'ICR gateway',
    serverType: 'fhir',
    fhirBaseUrl: 'https://gateway.healthcampaigns.org/fhir',
    fhirAuth: {
      tokenUrl: 'https://auth.healthcampaigns.org/realms/icr/protocol/openid-connect/token',
      clientId: ' key-icrdemo ',
      clientSecret: 'secret',
    },
  };

  it('accepts a token URL, client ID, and secret', () => {
    const result = validateProjectInput(gateway);
    expect(result.serverType === 'fhir' && result.fhirAuth).toEqual({
      tokenUrl: 'https://auth.healthcampaigns.org/realms/icr/protocol/openid-connect/token',
      clientId: 'key-icrdemo',
      clientSecret: 'secret',
    });
  });

  it('treats an empty secret as not provided', () => {
    const result = validateProjectInput({ ...gateway, fhirAuth: { ...gateway.fhirAuth, clientSecret: '' } });
    expect(result.serverType === 'fhir' && result.fhirAuth?.clientSecret).toBeUndefined();
  });

  it('accepts null fhirAuth as no authentication', () => {
    const result = validateProjectInput({ ...gateway, fhirAuth: null });
    expect(result.serverType === 'fhir' && result.fhirAuth).toBeNull();
  });

  it('requires https for the token URL except on localhost', () => {
    expect(() =>
      validateProjectInput({ ...gateway, fhirAuth: { ...gateway.fhirAuth, tokenUrl: 'http://auth.healthcampaigns.org/token' } }),
    ).toThrow('must use https');
    expect(() =>
      validateProjectInput({
        ...gateway,
        fhirBaseUrl: 'http://localhost:8080/fhir',
        fhirAuth: { ...gateway.fhirAuth, tokenUrl: 'http://localhost:8081/token' },
      }),
    ).not.toThrow();
  });

  it('requires an https FHIR base URL when credentials are set', () => {
    expect(() => validateProjectInput({ ...gateway, fhirBaseUrl: 'http://gateway.healthcampaigns.org/fhir' })).toThrow(
      'when client credentials are set',
    );
    expect(() =>
      validateProjectInput({ name: 'x', serverType: 'fhir', fhirBaseUrl: 'http://hapi.example.org/fhir' }),
    ).not.toThrow();
  });

  it('rejects a missing client ID', () => {
    expect(() => validateProjectInput({ ...gateway, fhirAuth: { ...gateway.fhirAuth, clientId: '  ' } })).toThrow();
  });

  it('drops fhirAuth from Google Cloud Healthcare projects', () => {
    const result = validateProjectInput({
      name: 'GCP',
      serverType: 'gcp',
      gcpProject: 'p',
      gcpLocation: 'l',
      gcpDataset: 'd',
      gcpFhirStore: 's',
      fhirAuth: gateway.fhirAuth,
    });
    expect(result.serverType).toBe('gcp');
    expect('fhirAuth' in result).toBe(false);
  });
});

describe('planFhirCredential', () => {
  const base = { name: 'x', serverType: 'fhir' as const, fhirBaseUrl: 'https://gateway.example.org/fhir' };
  const stored = { tokenUrl: 'https://auth.example.org/token', clientId: 'key-a' };

  it('saves new credentials when a secret is supplied', () => {
    expect(planFhirCredential({ ...base, fhirAuth: { ...stored, clientSecret: 's' } }, undefined)).toEqual({
      action: 'save',
      ...stored,
      clientSecret: 's',
    });
  });

  it('requires a secret when none is stored', () => {
    expect(planFhirCredential({ ...base, fhirAuth: { ...stored, clientSecret: undefined } }, undefined)).toEqual({
      action: 'reject',
      error: 'fhirAuth.clientSecret: Required',
    });
  });

  it('keeps the stored secret when token URL and client ID are unchanged', () => {
    expect(planFhirCredential({ ...base, fhirAuth: { ...stored, clientSecret: undefined } }, stored)).toEqual({ action: 'keep' });
  });

  it('asks for the secret again when the token URL or client ID changes', () => {
    const moved = { ...stored, tokenUrl: 'https://other.example.org/token', clientSecret: undefined };
    expect(planFhirCredential({ ...base, fhirAuth: moved }, stored).action).toBe('reject');
    const renamed = { ...stored, clientId: 'key-b', clientSecret: undefined };
    expect(planFhirCredential({ ...base, fhirAuth: renamed }, stored).action).toBe('reject');
  });

  it('removes stored credentials when auth is turned off', () => {
    expect(planFhirCredential({ ...base, fhirAuth: null }, stored)).toEqual({ action: 'remove' });
    expect(planFhirCredential(base, stored)).toEqual({ action: 'remove' });
  });

  it('removes stored credentials when a project switches to Google Cloud Healthcare', () => {
    const gcp = { name: 'x', serverType: 'gcp' as const, gcpProject: 'p', gcpLocation: 'l', gcpDataset: 'd', gcpFhirStore: 's' };
    expect(planFhirCredential(gcp, stored)).toEqual({ action: 'remove' });
  });
});

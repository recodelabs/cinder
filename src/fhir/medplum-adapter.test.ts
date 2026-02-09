// ABOUTME: Tests for the MedplumClient subclass that bridges to Healthcare API.
// ABOUTME: Verifies proxy URL construction and schema method overrides.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HealthcareMedplumClient } from './medplum-adapter';

describe('HealthcareMedplumClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resourceType: 'Patient', id: '123' }),
      status: 200,
      headers: new Headers({ 'content-type': 'application/fhir+json' }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  it('uses /fhir as the FHIR URL path', () => {
    const client = new HealthcareMedplumClient({ getAccessToken: () => 'tok' });
    const url = client.fhirUrl('Patient', '123');
    expect(url.pathname).toBe('/fhir/Patient/123');
  });

  it('requestSchema is a no-op', async () => {
    const client = new HealthcareMedplumClient({ getAccessToken: () => 'tok' });
    await client.requestSchema('Patient');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requestProfileSchema is a no-op', async () => {
    const client = new HealthcareMedplumClient({ getAccessToken: () => 'tok' });
    await client.requestProfileSchema('http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('valueSetExpand resolves locally for known ValueSets', async () => {
    const client = new HealthcareMedplumClient({ getAccessToken: () => 'tok' });
    const result = await client.valueSetExpand({ url: 'http://hl7.org/fhir/ValueSet/administrative-gender' });
    expect(result.resourceType).toBe('ValueSet');
    const codes = result.expansion?.contains?.map((c) => c.code);
    expect(codes).toContain('male');
    expect(codes).toContain('female');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses custom baseUrl when provided', () => {
    const client = new HealthcareMedplumClient({
      getAccessToken: () => 'tok',
      baseUrl: 'https://healthcare.googleapis.com/v1/projects/p/locations/l/datasets/d/fhirStores/s',
    });
    const url = client.fhirUrl('Patient', '123');
    expect(url.toString()).toBe(
      'https://healthcare.googleapis.com/v1/projects/p/locations/l/datasets/d/fhirStores/s/fhir/Patient/123'
    );
  });

  it('valueSetExpand falls back to server for unknown ValueSets', async () => {
    const client = new HealthcareMedplumClient({ getAccessToken: () => 'tok' });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resourceType: 'ValueSet', expansion: { contains: [] } }),
      status: 200,
      headers: new Headers({ 'content-type': 'application/fhir+json' }),
    });
    const result = await client.valueSetExpand({ url: 'http://example.com/unknown-valueset' });
    expect(mockFetch).toHaveBeenCalled();
    expect(result.resourceType).toBe('ValueSet');
  });
});

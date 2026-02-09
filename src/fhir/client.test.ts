// ABOUTME: Tests for the Healthcare API FHIR client adapter.
// ABOUTME: Verifies URL construction, CRUD operations, and auth header injection.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HealthcareFhirClient } from './client';

describe('HealthcareFhirClient', () => {
  let client: HealthcareFhirClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resourceType: 'Patient', id: '123' }),
      status: 200,
    });
    vi.stubGlobal('fetch', mockFetch);

    client = new HealthcareFhirClient({
      getAccessToken: () => 'test-token',
    });
  });

  it('uses /fhir as the base URL (proxy path)', () => {
    expect(client.baseUrl).toBe('/fhir');
  });

  it('reads a resource via proxy', async () => {
    const result = await client.read('Patient', '123');
    expect(mockFetch).toHaveBeenCalledWith(
      '/fhir/Patient/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
    expect(result).toEqual({ resourceType: 'Patient', id: '123' });
  });

  it('searches resources', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [],
        }),
      status: 200,
    });

    const params = new URLSearchParams({ name: 'Smith' });
    await client.search('Patient', params);

    expect(mockFetch).toHaveBeenCalledWith(
      '/fhir/Patient?name=Smith',
      expect.any(Object)
    );
  });

  it('creates a resource', async () => {
    const patient = { resourceType: 'Patient' as const, name: [{ family: 'Smith' }] };
    await client.create(patient);

    expect(mockFetch).toHaveBeenCalledWith(
      '/fhir/Patient',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(patient),
      })
    );
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'not-found' }],
        }),
    });

    await expect(client.read('Patient', 'missing')).rejects.toThrow();
  });
});

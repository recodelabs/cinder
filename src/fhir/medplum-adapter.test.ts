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
    const client = new HealthcareMedplumClient({});
    const url = client.fhirUrl('Patient', '123');
    expect(url.pathname).toBe('/fhir/Patient/123');
  });

  it('requestSchema loads schemas without network calls', async () => {
    const client = new HealthcareMedplumClient({});
    await client.requestSchema('Patient');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requestProfileSchema is a no-op', async () => {
    const client = new HealthcareMedplumClient({});
    await client.requestProfileSchema('http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('valueSetExpand resolves locally for known ValueSets', async () => {
    const client = new HealthcareMedplumClient({});
    const result = await client.valueSetExpand({ url: 'http://hl7.org/fhir/ValueSet/administrative-gender' });
    expect(result.resourceType).toBe('ValueSet');
    const codes = result.expansion?.contains?.map((c) => c.code);
    expect(codes).toContain('male');
    expect(codes).toContain('female');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends X-Project-Id header when projectId is configured', async () => {
    const client = new HealthcareMedplumClient({ projectId: 'proj-123' });
    await client.readResource('Patient', '123');
    expect(mockFetch).toHaveBeenCalled();
    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Project-Id')).toBe('proj-123');
  });

  it('does not send X-Project-Id header when projectId is not configured', async () => {
    const client = new HealthcareMedplumClient({});
    await client.readResource('Patient', '123');
    expect(mockFetch).toHaveBeenCalled();
    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Project-Id')).toBeNull();
  });

  it('requests go to same origin', () => {
    const client = new HealthcareMedplumClient({ projectId: 'proj-123' });
    const url = client.fhirUrl('Patient', '123');
    expect(url.pathname).toBe('/fhir/Patient/123');
    expect(url.origin).not.toContain('googleapis.com');
  });

  it('calls onUnauthenticated when fetch returns 401', async () => {
    const onUnauthenticated = vi.fn();
    const client = new HealthcareMedplumClient({ onUnauthenticated });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ issue: [{ details: { text: 'Unauthorized' } }] }),
      headers: new Headers({ 'content-type': 'application/fhir+json' }),
    });
    await expect(client.readResource('Patient', '123')).rejects.toThrow();
    expect(onUnauthenticated).toHaveBeenCalled();
  });

  it('does not call onUnauthenticated for non-401 errors', async () => {
    const onUnauthenticated = vi.fn();
    const client = new HealthcareMedplumClient({ onUnauthenticated });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ issue: [{ details: { text: 'Not found' } }] }),
      headers: new Headers({ 'content-type': 'application/fhir+json' }),
    });
    await expect(client.readResource('Patient', '123')).rejects.toThrow();
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('createAttachment creates a Binary and returns Attachment with URL', async () => {
    const client = new HealthcareMedplumClient({});
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resourceType: 'Binary', id: 'bin-456', contentType: 'image/jpeg' }),
      status: 201,
      headers: new Headers({ 'content-type': 'application/fhir+json' }),
    });
    const attachment = await client.createAttachment({
      data: new Blob(['fake-image'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
      filename: 'photo.jpg',
    });
    expect(attachment.contentType).toBe('image/jpeg');
    expect(attachment.title).toBe('photo.jpg');
    expect(attachment.url).toContain('/fhir/Binary/bin-456');
  });

  it('createAttachment works with deprecated positional args', async () => {
    const client = new HealthcareMedplumClient({});
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resourceType: 'Binary', id: 'bin-789', contentType: 'image/png' }),
      status: 201,
      headers: new Headers({ 'content-type': 'application/fhir+json' }),
    });
    const attachment = await client.createAttachment(
      new Blob(['fake-png'], { type: 'image/png' }),
      'avatar.png',
      'image/png'
    );
    expect(attachment.contentType).toBe('image/png');
    expect(attachment.title).toBe('avatar.png');
    expect(attachment.url).toContain('/fhir/Binary/bin-789');
  });

  it('valueSetExpand falls back to server for unknown ValueSets', async () => {
    const client = new HealthcareMedplumClient({});
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

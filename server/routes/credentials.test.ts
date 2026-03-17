// ABOUTME: Unit tests for the validateServiceAccountJson function.
// ABOUTME: Verifies validation of GCP service account JSON structure and constraints.
import { describe, expect, it, vi } from 'vitest';

// Mock modules that require runtime environment (DATABASE_URL, etc.)
vi.mock('../db', () => ({ db: {} }));
vi.mock('../crypto', () => ({
  encryptCredential: vi.fn(),
  getMasterKey: vi.fn(),
}));
vi.mock('../middleware', () => ({
  requireOrgOwner: vi.fn(),
}));
vi.mock('./shared', () => ({
  tokenCache: { evict: vi.fn() },
}));

import { validateServiceAccountJson } from './credentials';

const VALID_SA = JSON.stringify({
  type: 'service_account',
  project_id: 'my-project',
  private_key_id: 'key-123',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'sa@my-project.iam.gserviceaccount.com',
});

describe('validateServiceAccountJson', () => {
  it('accepts valid service account JSON', () => {
    expect(() => validateServiceAccountJson(VALID_SA)).not.toThrow();
  });

  it('rejects non-service-account type', () => {
    const json = JSON.stringify({
      type: 'authorized_user',
      project_id: 'my-project',
      private_key_id: 'key-123',
      private_key: 'fake-key',
      client_email: 'sa@example.com',
    });
    expect(() => validateServiceAccountJson(json)).toThrow('type must be "service_account"');
  });

  it('rejects missing project_id', () => {
    const json = JSON.stringify({
      type: 'service_account',
      private_key_id: 'key-123',
      private_key: 'fake-key',
      client_email: 'sa@example.com',
    });
    expect(() => validateServiceAccountJson(json)).toThrow('missing required field "project_id"');
  });

  it('rejects missing private_key_id', () => {
    const json = JSON.stringify({
      type: 'service_account',
      project_id: 'my-project',
      private_key: 'fake-key',
      client_email: 'sa@example.com',
    });
    expect(() => validateServiceAccountJson(json)).toThrow('missing required field "private_key_id"');
  });

  it('rejects missing private_key', () => {
    const json = JSON.stringify({
      type: 'service_account',
      project_id: 'my-project',
      private_key_id: 'key-123',
      client_email: 'sa@example.com',
    });
    expect(() => validateServiceAccountJson(json)).toThrow('missing required field "private_key"');
  });

  it('rejects missing client_email', () => {
    const json = JSON.stringify({
      type: 'service_account',
      project_id: 'my-project',
      private_key_id: 'key-123',
      private_key: 'fake-key',
    });
    expect(() => validateServiceAccountJson(json)).toThrow('missing required field "client_email"');
  });

  it('rejects input over 10KB', () => {
    const large = 'x'.repeat(10 * 1024 + 1);
    expect(() => validateServiceAccountJson(large)).toThrow('exceeds 10KB limit');
  });

  it('rejects invalid JSON', () => {
    expect(() => validateServiceAccountJson('not json {')).toThrow('Invalid JSON');
  });
});

// ABOUTME: Tests for the envelope encryption module.
// ABOUTME: Verifies round-trip encryption, tamper detection, and key versioning.

import { randomBytes } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential, getMasterKey } from './crypto';

function generateKey(): string {
  return randomBytes(32).toString('base64');
}

const sampleCredential = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key-123',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake-key-data\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'test@test-project.iam.gserviceaccount.com',
});

describe('encryptCredential / decryptCredential', () => {
  it('round-trips encrypt then decrypt', () => {
    const masterKey = generateKey();
    const encrypted = encryptCredential(sampleCredential, masterKey);
    const decrypted = decryptCredential(encrypted, masterKey);
    expect(decrypted).toBe(sampleCredential);
  });

  it('produces different ciphertext each time (random DEK + IV)', () => {
    const masterKey = generateKey();
    const a = encryptCredential(sampleCredential, masterKey);
    const b = encryptCredential(sampleCredential, masterKey);

    expect(a.encryptedServiceAccount).not.toBe(b.encryptedServiceAccount);
    expect(a.encryptedDek).not.toBe(b.encryptedDek);
    expect(a.iv).not.toBe(b.iv);
    expect(a.dekIv).not.toBe(b.dekIv);
  });

  it('detects tampered ciphertext', () => {
    const masterKey = generateKey();
    const encrypted = encryptCredential(sampleCredential, masterKey);

    // Tamper with the encrypted service account
    const tampered = { ...encrypted };
    const buf = Buffer.from(tampered.encryptedServiceAccount, 'base64');
    buf[0] = buf[0]! ^ 0xff;
    tampered.encryptedServiceAccount = buf.toString('base64');

    expect(() => decryptCredential(tampered, masterKey)).toThrow();
  });

  it('fails with wrong master key', () => {
    const masterKey = generateKey();
    const wrongKey = generateKey();
    const encrypted = encryptCredential(sampleCredential, masterKey);

    expect(() => decryptCredential(encrypted, wrongKey)).toThrow();
  });

  it('rejects master key of wrong length', () => {
    const shortKey = randomBytes(16).toString('base64');
    expect(() => encryptCredential(sampleCredential, shortKey)).toThrow(/must be 32 bytes/);
    expect(() =>
      decryptCredential(
        {
          encryptedServiceAccount: '',
          encryptedDek: '',
          iv: '',
          authTag: '',
          dekIv: '',
          dekAuthTag: '',
          keyVersion: 1,
        },
        shortKey,
      ),
    ).toThrow(/must be 32 bytes/);
  });

  it('sets keyVersion from CINDER_ENCRYPTION_KEY_VERSION env var', () => {
    const masterKey = generateKey();
    const original = process.env.CINDER_ENCRYPTION_KEY_VERSION;
    try {
      process.env.CINDER_ENCRYPTION_KEY_VERSION = '3';
      const encrypted = encryptCredential(sampleCredential, masterKey);
      expect(encrypted.keyVersion).toBe(3);
    } finally {
      if (original === undefined) {
        delete process.env.CINDER_ENCRYPTION_KEY_VERSION;
      } else {
        process.env.CINDER_ENCRYPTION_KEY_VERSION = original;
      }
    }
  });
});

describe('getMasterKey', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      CINDER_ENCRYPTION_KEY: process.env.CINDER_ENCRYPTION_KEY,
      CINDER_ENCRYPTION_KEY_VERSION: process.env.CINDER_ENCRYPTION_KEY_VERSION,
      CINDER_ENCRYPTION_KEY_V1: process.env.CINDER_ENCRYPTION_KEY_V1,
      CINDER_ENCRYPTION_KEY_V2: process.env.CINDER_ENCRYPTION_KEY_V2,
    };
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('returns CINDER_ENCRYPTION_KEY when no version is passed', () => {
    process.env.CINDER_ENCRYPTION_KEY = 'my-key';
    process.env.CINDER_ENCRYPTION_KEY_VERSION = '1';
    expect(getMasterKey()).toBe('my-key');
  });

  it('returns CINDER_ENCRYPTION_KEY when requested version matches current', () => {
    process.env.CINDER_ENCRYPTION_KEY = 'current-key';
    process.env.CINDER_ENCRYPTION_KEY_VERSION = '2';
    expect(getMasterKey(2)).toBe('current-key');
  });

  it('returns versioned key when requested version differs from current', () => {
    process.env.CINDER_ENCRYPTION_KEY = 'current-key';
    process.env.CINDER_ENCRYPTION_KEY_VERSION = '2';
    process.env.CINDER_ENCRYPTION_KEY_V1 = 'old-key-v1';
    expect(getMasterKey(1)).toBe('old-key-v1');
  });

  it('throws if CINDER_ENCRYPTION_KEY is missing', () => {
    delete process.env.CINDER_ENCRYPTION_KEY;
    process.env.CINDER_ENCRYPTION_KEY_VERSION = '1';
    expect(() => getMasterKey()).toThrow('Missing required environment variable: CINDER_ENCRYPTION_KEY');
  });

  it('throws if versioned key env var is missing', () => {
    process.env.CINDER_ENCRYPTION_KEY = 'current-key';
    process.env.CINDER_ENCRYPTION_KEY_VERSION = '2';
    delete process.env.CINDER_ENCRYPTION_KEY_V1;
    expect(() => getMasterKey(1)).toThrow('Missing required environment variable: CINDER_ENCRYPTION_KEY_V1');
  });

  it('defaults to version 1 when CINDER_ENCRYPTION_KEY_VERSION is not set', () => {
    delete process.env.CINDER_ENCRYPTION_KEY_VERSION;
    process.env.CINDER_ENCRYPTION_KEY = 'default-key';
    expect(getMasterKey()).toBe('default-key');
    expect(getMasterKey(1)).toBe('default-key');
  });
});

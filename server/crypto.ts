// ABOUTME: Envelope encryption module for service account credentials.
// ABOUTME: Uses AES-256-GCM with random DEKs encrypted by a master key.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const KEY_LENGTH = 32; // 256 bits

export interface EncryptedCredential {
  encryptedServiceAccount: string; // base64
  encryptedDek: string; // base64
  iv: string; // base64
  authTag: string; // base64
  dekIv: string; // base64
  dekAuthTag: string; // base64
  keyVersion: number;
}

export function encryptCredential(
  credentialJson: string,
  masterKeyBase64: string,
): EncryptedCredential {
  const masterKey = Buffer.from(masterKeyBase64, 'base64');
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes (got ${masterKey.length})`);
  }

  // Generate random DEK
  const dek = randomBytes(KEY_LENGTH);

  // Encrypt credential JSON with DEK
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const encrypted = Buffer.concat([cipher.update(credentialJson, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Encrypt DEK with master key
  const dekIv = randomBytes(IV_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, masterKey, dekIv);
  const encryptedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekAuthTag = dekCipher.getAuthTag();

  const currentVersion = parseInt(process.env.CINDER_ENCRYPTION_KEY_VERSION ?? '1', 10);

  return {
    encryptedServiceAccount: encrypted.toString('base64'),
    encryptedDek: encryptedDek.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    dekIv: dekIv.toString('base64'),
    dekAuthTag: dekAuthTag.toString('base64'),
    keyVersion: currentVersion,
  };
}

export function decryptCredential(
  encrypted: EncryptedCredential,
  masterKeyBase64: string,
): string {
  const masterKey = Buffer.from(masterKeyBase64, 'base64');
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes (got ${masterKey.length})`);
  }

  // Decrypt DEK with master key
  const dekDecipher = createDecipheriv(
    ALGORITHM,
    masterKey,
    Buffer.from(encrypted.dekIv, 'base64'),
  );
  dekDecipher.setAuthTag(Buffer.from(encrypted.dekAuthTag, 'base64'));
  const dek = Buffer.concat([
    dekDecipher.update(Buffer.from(encrypted.encryptedDek, 'base64')),
    dekDecipher.final(),
  ]);

  // Decrypt credential JSON with DEK
  const decipher = createDecipheriv(ALGORITHM, dek, Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedServiceAccount, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function getMasterKey(version?: number): string {
  const currentVersion = parseInt(process.env.CINDER_ENCRYPTION_KEY_VERSION ?? '1', 10);

  if (version === undefined || version === currentVersion) {
    const key = process.env.CINDER_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('Missing required environment variable: CINDER_ENCRYPTION_KEY');
    }
    return key;
  }

  const envVar = `CINDER_ENCRYPTION_KEY_V${version}`;
  const key = process.env[envVar];
  if (!key) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
  return key;
}

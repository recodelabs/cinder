// ABOUTME: Envelope encryption for GCP service account credentials.
// ABOUTME: Encrypts/decrypts JSON credentials using AES-256-GCM with a master key from environment.

export interface EncryptedCredential {
  readonly iv: string;
  readonly ciphertext: string;
  readonly tag: string;
}

export function getMasterKey(): Buffer {
  const hex = process.env.CREDENTIAL_MASTER_KEY;
  if (!hex) {
    throw new Error('CREDENTIAL_MASTER_KEY environment variable is required');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptCredential(plaintext: string, key: Buffer): EncryptedCredential {
  const crypto = require('crypto');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptCredential(encrypted: EncryptedCredential, key: Buffer): string {
  const crypto = require('crypto');
  const iv = Buffer.from(encrypted.iv, 'base64');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
  const tag = Buffer.from(encrypted.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

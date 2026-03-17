// ABOUTME: CLI script to rotate the master encryption key for org credentials.
// ABOUTME: Re-encrypts all DEKs with the new master key and updates key_version.
import { eq } from 'drizzle-orm';
import { db } from './db';
import { orgCredential } from './schema';
import { decryptCredential, encryptCredential, getMasterKey } from './crypto';

async function rotateKeys() {
  const currentVersion = parseInt(process.env.CINDER_ENCRYPTION_KEY_VERSION ?? '1', 10);
  const newMasterKey = getMasterKey(currentVersion);

  const rows = await db.select().from(orgCredential);
  console.log(`Rotating ${rows.length} credential(s) to key version ${currentVersion}...`);

  for (const row of rows) {
    if (row.keyVersion === currentVersion) {
      console.log(`  Skipping org ${row.organizationId} (already at version ${currentVersion})`);
      continue;
    }

    const oldMasterKey = getMasterKey(row.keyVersion);
    const plaintext = decryptCredential(row, oldMasterKey);
    const reEncrypted = encryptCredential(plaintext, newMasterKey);

    await db
      .update(orgCredential)
      .set({
        encryptedServiceAccount: reEncrypted.encryptedServiceAccount,
        encryptedDek: reEncrypted.encryptedDek,
        iv: reEncrypted.iv,
        authTag: reEncrypted.authTag,
        dekIv: reEncrypted.dekIv,
        dekAuthTag: reEncrypted.dekAuthTag,
        keyVersion: currentVersion,
        updatedAt: new Date(),
      })
      .where(eq(orgCredential.id, row.id));

    console.log(`  Rotated credential for org ${row.organizationId}`);
  }

  console.log('Done.');
  process.exit(0);
}

rotateKeys().catch((err) => {
  console.error('Key rotation failed:', err);
  process.exit(1);
});

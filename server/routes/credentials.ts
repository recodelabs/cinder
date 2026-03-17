// ABOUTME: API route handlers for managing encrypted GCP service account credentials.
// ABOUTME: Provides PUT (upsert) and GET (status check) endpoints scoped to organization owners.
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { orgCredential } from '../schema';
import { encryptCredential, getMasterKey } from '../crypto';
import { requireOrgOwner } from '../middleware';
import { tokenCache } from './shared';

const MAX_CREDENTIAL_SIZE = 10 * 1024; // 10KB

const REQUIRED_FIELDS = ['project_id', 'private_key_id', 'private_key', 'client_email'] as const;

export function validateServiceAccountJson(raw: string): void {
  if (raw.length > MAX_CREDENTIAL_SIZE) {
    throw new Error('Service account JSON exceeds 10KB limit');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid JSON: expected an object');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['type'] !== 'service_account') {
    throw new Error('Invalid service account: type must be "service_account"');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!obj[field] || typeof obj[field] !== 'string') {
      throw new Error(`Invalid service account: missing required field "${field}"`);
    }
  }
}

export async function handlePutCredential(req: Request, orgId: string): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const body = await req.text();

  try {
    validateServiceAccountJson(body);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Validation failed' },
      { status: 400 },
    );
  }

  const encrypted = encryptCredential(body, getMasterKey());

  const existing = await db
    .select({ orgId: orgCredential.orgId })
    .from(orgCredential)
    .where(eq(orgCredential.orgId, orgId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(orgCredential)
      .set({
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        tag: encrypted.tag,
        updatedAt: new Date(),
      })
      .where(eq(orgCredential.orgId, orgId));
  } else {
    await db.insert(orgCredential).values({
      orgId,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      tag: encrypted.tag,
    });
  }

  tokenCache.evict(orgId);

  return Response.json({ ok: true }, { status: 200 });
}

export async function handleGetCredentialStatus(req: Request, orgId: string): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const rows = await db
    .select({
      createdAt: orgCredential.createdAt,
      updatedAt: orgCredential.updatedAt,
    })
    .from(orgCredential)
    .where(eq(orgCredential.orgId, orgId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return Response.json({ configured: false });
  }

  return Response.json({
    configured: true,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

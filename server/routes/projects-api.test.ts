// ABOUTME: Database-backed tests for the project API's handling of FHIR server client credentials.
// ABOUTME: Checks the secret is stored encrypted, never returned, kept or replaced correctly, and removed with the project. Needs DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { randomBytes, randomUUID } from 'crypto';

const SECRET = `secret-${randomUUID()}`;
const TOKEN_URL = 'https://auth.healthcampaigns.org/realms/icr/protocol/openid-connect/token';
const ORG_ID = `test-org-${randomUUID()}`;

mock.module('../middleware', () => ({
  requireOrgMember: async () => ({ userId: 'u', email: 'e', memberId: 'm', role: 'owner' }),
  requireOrgOwner: async () => ({ userId: 'u', email: 'e', memberId: 'm', role: 'owner' }),
}));

describe.skipIf(!process.env.DATABASE_URL)('project API with FHIR server client credentials', () => {
  let routes: typeof import('./projects');
  let db: typeof import('../db')['db'];
  let schema: typeof import('../schema');
  let decryptClientSecret: typeof import('../fhir-auth')['decryptClientSecret'];
  let sql: typeof import('drizzle-orm')['sql'];
  let eq: typeof import('drizzle-orm')['eq'];
  const masterKey = randomBytes(32).toString('base64');

  beforeAll(async () => {
    process.env.CINDER_ENCRYPTION_KEY = masterKey;
    process.env.CINDER_ENCRYPTION_KEY_VERSION = '1';
    process.env.CINDER_ALLOWED_FHIR_HOSTS = 'gateway.healthcampaigns.org,auth.healthcampaigns.org';
    routes = await import('./projects');
    const dbModule = await import('../db');
    db = dbModule.db;
    await dbModule.ensureTables();
    schema = await import('../schema');
    ({ decryptClientSecret } = await import('../fhir-auth'));
    ({ sql, eq } = await import('drizzle-orm'));
    await db.execute(sql`INSERT INTO "organization" (id, name, slug, created_at) VALUES (${ORG_ID}, 'Test', ${ORG_ID}, NOW())`);
  });

  afterAll(async () => {
    await db.delete(schema.project).where(eq(schema.project.organizationId, ORG_ID));
    await db.execute(sql`DELETE FROM "organization" WHERE id = ${ORG_ID}`);
  });

  const gatewayBody = (fhirAuth: unknown) => ({
    name: `Gateway ${randomUUID()}`,
    serverType: 'fhir',
    fhirBaseUrl: 'https://gateway.healthcampaigns.org/fhir',
    fhirAuth,
  });

  async function call(handler: (req: Request, id: string) => Promise<Response>, id: string, method: string, body?: unknown) {
    const req = new Request('http://localhost/api', { method, body: body === undefined ? undefined : JSON.stringify(body) });
    const res = await handler(req, id);
    const text = await res.text();
    return { status: res.status, text, json: text ? JSON.parse(text) : undefined };
  }

  async function storedRow(projectId: string) {
    const [row] = await db
      .select()
      .from(schema.fhirServerCredential)
      .where(eq(schema.fhirServerCredential.projectId, projectId));
    return row;
  }

  it('stores the secret encrypted and returns only whether it is set', async () => {
    const created = await call(routes.handleCreateProject, ORG_ID, 'POST',
      gatewayBody({ tokenUrl: TOKEN_URL, clientId: 'key-icrdemo', clientSecret: SECRET }));
    expect(created.status).toBe(201);
    expect(created.json.fhirAuth).toEqual({ tokenUrl: TOKEN_URL, clientId: 'key-icrdemo', clientSecretSet: true });
    expect(created.text).not.toContain(SECRET);
    expect(created.text).not.toContain('encrypted');

    const row = await storedRow(created.json.id);
    expect(row!.encryptedClientSecret).not.toContain(SECRET);
    expect(decryptClientSecret(row!, masterKey)).toBe(SECRET);

    for (const res of [
      await call(routes.handleGetProject, created.json.id, 'GET'),
      await call(routes.handleListProjects, ORG_ID, 'GET'),
    ]) {
      expect(res.status).toBe(200);
      expect(res.text).not.toContain(SECRET);
      expect(res.text).not.toContain(row!.encryptedClientSecret);
      expect(res.text).toContain('"clientSecretSet":true');
    }
  });

  it('keeps the stored secret on an edit that leaves it blank, and asks again if the client ID changes', async () => {
    const created = await call(routes.handleCreateProject, ORG_ID, 'POST',
      gatewayBody({ tokenUrl: TOKEN_URL, clientId: 'key-icrdemo', clientSecret: SECRET }));
    const before = await storedRow(created.json.id);

    const kept = await call(routes.handleUpdateProject, created.json.id, 'PATCH',
      { ...gatewayBody({ tokenUrl: TOKEN_URL, clientId: 'key-icrdemo', clientSecret: '' }), name: 'Renamed' });
    expect(kept.status).toBe(200);
    expect(kept.json.fhirAuth.clientSecretSet).toBe(true);
    expect((await storedRow(created.json.id))!.encryptedClientSecret).toBe(before!.encryptedClientSecret);

    const changed = await call(routes.handleUpdateProject, created.json.id, 'PATCH',
      gatewayBody({ tokenUrl: TOKEN_URL, clientId: 'key-other' }));
    expect(changed.status).toBe(400);
    expect(changed.json.error).toContain('Enter the secret again');

    const replaced = await call(routes.handleUpdateProject, created.json.id, 'PATCH',
      gatewayBody({ tokenUrl: TOKEN_URL, clientId: 'key-other', clientSecret: 'new-secret' }));
    expect(replaced.status).toBe(200);
    expect(decryptClientSecret((await storedRow(created.json.id))!, masterKey)).toBe('new-secret');
  });

  it('removes the credentials when auth is turned off or the project is deleted', async () => {
    const created = await call(routes.handleCreateProject, ORG_ID, 'POST',
      gatewayBody({ tokenUrl: TOKEN_URL, clientId: 'key-icrdemo', clientSecret: SECRET }));

    const off = await call(routes.handleUpdateProject, created.json.id, 'PATCH', gatewayBody(null));
    expect(off.status).toBe(200);
    expect(off.json.fhirAuth).toBeNull();
    expect(await storedRow(created.json.id)).toBeUndefined();

    await call(routes.handleUpdateProject, created.json.id, 'PATCH',
      gatewayBody({ tokenUrl: TOKEN_URL, clientId: 'key-icrdemo', clientSecret: SECRET }));
    expect(await storedRow(created.json.id)).toBeDefined();
    const deleted = await call(routes.handleDeleteProject, created.json.id, 'DELETE');
    expect(deleted.status).toBe(204);
    expect(await storedRow(created.json.id)).toBeUndefined();
  });

  it('rejects a token URL whose host is not allowed', async () => {
    const res = await call(routes.handleCreateProject, ORG_ID, 'POST',
      gatewayBody({ tokenUrl: 'https://evil.example.org/token', clientId: 'key-icrdemo', clientSecret: SECRET }));
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('token URL host is not allowed');
  });

  it('requires a secret when creating credentials', async () => {
    const res = await call(routes.handleCreateProject, ORG_ID, 'POST',
      gatewayBody({ tokenUrl: TOKEN_URL, clientId: 'key-icrdemo' }));
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('fhirAuth.clientSecret: Required');
  });

  it('leaves Google Cloud Healthcare projects without client credentials', async () => {
    const res = await call(routes.handleCreateProject, ORG_ID, 'POST', {
      name: `GCP ${randomUUID()}`,
      serverType: 'gcp',
      gcpProject: 'p',
      gcpLocation: 'us-central1',
      gcpDataset: 'd',
      gcpFhirStore: 's',
      fhirAuth: { tokenUrl: TOKEN_URL, clientId: 'key-icrdemo', clientSecret: SECRET },
    });
    expect(res.status).toBe(201);
    expect(res.json.serverType).toBe('gcp');
    expect(res.json.gcpFhirStore).toBe('s');
    expect(res.json.fhirAuth).toBeNull();
    expect(await storedRow(res.json.id)).toBeUndefined();
  });
});

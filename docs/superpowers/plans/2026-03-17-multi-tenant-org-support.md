# Multi-Tenant Organization Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-tenant organization support with per-org service account credentials, Better Auth for identity, and project-based FHIR store access.

**Architecture:** Replace the current Google OAuth implicit flow with Better Auth (server-side sessions + Google social login). Add org/member management via Better Auth's organization plugin. Store per-org service account keys using envelope encryption (AES-256-GCM). The FHIR proxy authenticates to GCP using the org's service account instead of the user's personal token.

**Tech Stack:** Better Auth, Drizzle ORM, PostgreSQL, Zod, AES-256-GCM encryption, Google Auth Library (for service account token minting)

**Spec:** `docs/superpowers/specs/2026-03-17-multi-tenant-org-support-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `server/auth.ts` | Better Auth server instance with Google social provider + organization plugin |
| `server/crypto.ts` | Envelope encryption: encrypt/decrypt service account JSON with AES-256-GCM |
| `server/token-cache.ts` | In-memory cache for GCP access tokens minted from service accounts, keyed by org ID |
| `server/routes/auth.ts` | Thin handler that delegates all `/api/auth/*` requests to Better Auth |
| `server/routes/credentials.ts` | `PUT /api/orgs/:id/credential` and `GET /api/orgs/:id/credential` handlers |
| `server/routes/projects.ts` | Project CRUD handlers: list, create, get, update, delete |
| `server/routes/members.ts` | Direct-add member endpoint: `POST /api/orgs/:id/members` |
| `server/middleware.ts` | Shared helpers: `requireSession()`, `requireOrgMember()`, `requireOrgOwner()` |
| `server/gcp-token.ts` | Mints GCP access tokens from service account JSON using google-auth-library |
| `src/auth/auth-client.ts` | Better Auth React client with organization plugin |
| `src/auth/AuthProvider.tsx` | **Rewrite** — wraps Better Auth session instead of Google OAuth implicit flow |
| `src/contexts/OrgContext.tsx` | React context for active org + project selection |
| `src/pages/CreateOrgPage.tsx` | Create organization form (name, slug) |
| `src/pages/OrgSettingsPage.tsx` | Org settings: members tab + credentials tab |
| `src/pages/ProjectsPage.tsx` | List projects for current org |
| `src/pages/CreateProjectPage.tsx` | Create project form (name, slug, GCP coordinates) |
| `src/components/OrgSwitcher.tsx` | Dropdown to switch active organization |
| `src/components/ProjectSwitcher.tsx` | Dropdown to switch active project |
| `server/crypto.test.ts` | Tests for envelope encryption |
| `server/token-cache.test.ts` | Tests for token cache with TTL + invalidation |
| `server/routes/credentials.test.ts` | Tests for credential upload/status endpoints |
| `server/routes/projects.test.ts` | Tests for project CRUD endpoints |

### Modified Files

| File | Change |
|------|--------|
| `server/schema.ts` | Add `orgCredential` and `project` table definitions |
| `server/db.ts` | Update `ensureTables()` to create new tables |
| `server.ts` | Add `/api/auth/*`, org, project, credential, member routes; rewrite FHIR proxy |
| `src/fhir/medplum-adapter.ts` | Send session cookie + `X-Project-Id` header instead of Bearer token + `X-Store-Base` |
| `src/App.tsx` | New route structure with org/project slugs; remove old auth gating |
| `src/AppProviders.tsx` | Replace AuthProvider wiring; add OrgContext |
| `src/Shell.tsx` | Add OrgSwitcher + ProjectSwitcher to header; update sidebar links |
| `src/pages/SignInPage.tsx` | Use Better Auth `signIn.social({ provider: "google" })` instead of GIS |
| `package.json` | Add better-auth, zod dependencies |
| `.env.example` | Add new env vars, document old ones as deprecated |
| `vite.config.ts` | Add `/api` proxy for dev server |

### Deprecated (not deleted)

| File | Reason |
|------|--------|
| `src/auth/google-auth.ts` | Replaced by Better Auth sessions — keep for reference during migration |
| `src/config/StoreSelector.tsx` | Replaced by ProjectSwitcher |
| `src/config/stores-api.ts` | Replaced by project API |
| `server/stores-api.ts` | Routes removed from server.ts |
| `server/google-auth.ts` | Token validation replaced by Better Auth sessions |

---

## Task 1: Add Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
bun add better-auth zod google-auth-library
```

Note: `drizzle-orm`, `postgres`, and `google-auth-library` (dev) are already installed. `google-auth-library` needs to move from devDependencies to dependencies since the server now uses it at runtime for service account token minting.

- [ ] **Step 2: Verify installation**

```bash
bun run build
```

Expected: Build succeeds (no code changes yet, just new deps).

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "feat: add better-auth and zod dependencies for org support"
```

---

## Task 2: Envelope Encryption Module

**Files:**
- Create: `server/crypto.ts`
- Create: `server/crypto.test.ts`

This is a pure utility with no external dependencies beyond Node crypto. Build it first so credential storage can use it.

- [ ] **Step 1: Write the failing tests**

Create `server/crypto.test.ts`:

```typescript
// ABOUTME: Tests for envelope encryption of service account credentials.
// ABOUTME: Verifies encrypt/decrypt round-trip, tamper detection, and key version tracking.
import { describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential, getMasterKey } from './crypto';

describe('envelope encryption', () => {
  // Set a test master key (32 bytes, base64-encoded)
  const TEST_MASTER_KEY = Buffer.from('a'.repeat(32)).toString('base64');

  const sampleCredential = JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    private_key_id: 'key-123',
    private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
    client_email: 'test@test-project.iam.gserviceaccount.com',
  });

  it('round-trips encrypt then decrypt', () => {
    const encrypted = encryptCredential(sampleCredential, TEST_MASTER_KEY);
    expect(encrypted.encryptedServiceAccount).toBeTruthy();
    expect(encrypted.encryptedDek).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
    expect(encrypted.dekIv).toBeTruthy();
    expect(encrypted.dekAuthTag).toBeTruthy();
    expect(encrypted.keyVersion).toBe(1);

    const decrypted = decryptCredential(encrypted, TEST_MASTER_KEY);
    expect(decrypted).toBe(sampleCredential);
  });

  it('produces different ciphertext each time (random DEK + IV)', () => {
    const a = encryptCredential(sampleCredential, TEST_MASTER_KEY);
    const b = encryptCredential(sampleCredential, TEST_MASTER_KEY);
    expect(a.encryptedServiceAccount).not.toBe(b.encryptedServiceAccount);
  });

  it('detects tampered ciphertext', () => {
    const encrypted = encryptCredential(sampleCredential, TEST_MASTER_KEY);
    encrypted.encryptedServiceAccount = 'tampered' + encrypted.encryptedServiceAccount;
    expect(() => decryptCredential(encrypted, TEST_MASTER_KEY)).toThrow();
  });

  it('fails with wrong master key', () => {
    const encrypted = encryptCredential(sampleCredential, TEST_MASTER_KEY);
    const wrongKey = Buffer.from('b'.repeat(32)).toString('base64');
    expect(() => decryptCredential(encrypted, wrongKey)).toThrow();
  });

  it('getMasterKey throws if env var is missing', () => {
    const original = process.env.CINDER_ENCRYPTION_KEY;
    delete process.env.CINDER_ENCRYPTION_KEY;
    expect(() => getMasterKey()).toThrow('CINDER_ENCRYPTION_KEY');
    process.env.CINDER_ENCRYPTION_KEY = original;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun vitest run server/crypto.test.ts
```

Expected: FAIL — module `./crypto` not found.

- [ ] **Step 3: Implement the encryption module**

Create `server/crypto.ts`:

```typescript
// ABOUTME: Envelope encryption for service account credentials using AES-256-GCM.
// ABOUTME: Each org gets a unique DEK wrapped by a master key from CINDER_ENCRYPTION_KEY env var.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM

export interface EncryptedCredential {
  encryptedServiceAccount: string; // base64
  encryptedDek: string;            // base64
  iv: string;                      // base64
  authTag: string;                 // base64
  dekIv: string;                   // base64
  dekAuthTag: string;              // base64
  keyVersion: number;
}

export function getMasterKey(version?: number): string {
  if (version && version > 1) {
    const key = process.env[`CINDER_ENCRYPTION_KEY_V${version}`];
    if (!key) {
      throw new Error(`CINDER_ENCRYPTION_KEY_V${version} environment variable is required for key version ${version}`);
    }
    return key;
  }
  const key = process.env.CINDER_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CINDER_ENCRYPTION_KEY environment variable is required');
  }
  return key;
}

function encrypt(plaintext: Buffer, key: Buffer): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

function decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptCredential(credentialJson: string, masterKeyBase64: string): EncryptedCredential {
  const masterKey = Buffer.from(masterKeyBase64, 'base64');
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes (got ${masterKey.length})`);
  }

  // Generate random DEK
  const dek = randomBytes(KEY_LENGTH);

  // Encrypt credential with DEK
  const credResult = encrypt(Buffer.from(credentialJson, 'utf-8'), dek);

  // Encrypt DEK with master key
  const dekResult = encrypt(dek, masterKey);

  return {
    encryptedServiceAccount: credResult.ciphertext.toString('base64'),
    encryptedDek: dekResult.ciphertext.toString('base64'),
    iv: credResult.iv.toString('base64'),
    authTag: credResult.authTag.toString('base64'),
    dekIv: dekResult.iv.toString('base64'),
    dekAuthTag: dekResult.authTag.toString('base64'),
    keyVersion: 1,
  };
}

export function decryptCredential(encrypted: EncryptedCredential, masterKeyBase64: string): string {
  const masterKey = Buffer.from(masterKeyBase64, 'base64');

  // Decrypt DEK with master key
  const dek = decrypt(
    Buffer.from(encrypted.encryptedDek, 'base64'),
    masterKey,
    Buffer.from(encrypted.dekIv, 'base64'),
    Buffer.from(encrypted.dekAuthTag, 'base64'),
  );

  // Decrypt credential with DEK
  const credential = decrypt(
    Buffer.from(encrypted.encryptedServiceAccount, 'base64'),
    dek,
    Buffer.from(encrypted.iv, 'base64'),
    Buffer.from(encrypted.authTag, 'base64'),
  );

  return credential.toString('utf-8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun vitest run server/crypto.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/crypto.ts server/crypto.test.ts
git commit -m "feat: add envelope encryption module for service account credentials"
```

---

## Task 3: GCP Token Minting + Cache

**Files:**
- Create: `server/gcp-token.ts`
- Create: `server/token-cache.ts`
- Create: `server/token-cache.test.ts`

These modules handle minting GCP access tokens from service account JSON and caching them in memory.

- [ ] **Step 1: Write the token cache tests**

Create `server/token-cache.test.ts`:

```typescript
// ABOUTME: Tests for in-memory GCP access token cache with TTL and invalidation.
// ABOUTME: Verifies caching, expiry, and manual eviction behavior.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenCache } from './token-cache';

describe('TokenCache', () => {
  let cache: TokenCache;

  beforeEach(() => {
    cache = new TokenCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for missing key', () => {
    expect(cache.get('org-1')).toBeUndefined();
  });

  it('stores and retrieves a token', () => {
    cache.set('org-1', 'token-abc', 3600);
    expect(cache.get('org-1')).toBe('token-abc');
  });

  it('expires tokens after TTL', () => {
    cache.set('org-1', 'token-abc', 60); // 60 seconds
    vi.advanceTimersByTime(61_000);
    expect(cache.get('org-1')).toBeUndefined();
  });

  it('evicts a specific org token', () => {
    cache.set('org-1', 'token-abc', 3600);
    cache.evict('org-1');
    expect(cache.get('org-1')).toBeUndefined();
  });

  it('does not affect other orgs on evict', () => {
    cache.set('org-1', 'token-a', 3600);
    cache.set('org-2', 'token-b', 3600);
    cache.evict('org-1');
    expect(cache.get('org-2')).toBe('token-b');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun vitest run server/token-cache.test.ts
```

Expected: FAIL — module `./token-cache` not found.

- [ ] **Step 3: Implement the token cache**

Create `server/token-cache.ts`:

```typescript
// ABOUTME: In-memory cache for GCP access tokens minted from service accounts.
// ABOUTME: Keyed by org ID, with configurable TTL and manual eviction for credential updates.

interface CacheEntry {
  token: string;
  expiresAt: number;
}

export class TokenCache {
  private cache = new Map<string, CacheEntry>();

  get(orgId: string): string | undefined {
    const entry = this.cache.get(orgId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(orgId);
      return undefined;
    }
    return entry.token;
  }

  set(orgId: string, token: string, ttlSeconds: number): void {
    this.cache.set(orgId, {
      token,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  evict(orgId: string): void {
    this.cache.delete(orgId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun vitest run server/token-cache.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Implement GCP token minting**

Create `server/gcp-token.ts`:

```typescript
// ABOUTME: Mints GCP access tokens from service account JSON credentials.
// ABOUTME: Uses google-auth-library to create a JWT and exchange it for an access token.
import { GoogleAuth } from 'google-auth-library';

const GCP_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export interface GcpToken {
  accessToken: string;
  expiresInSeconds: number;
}

export async function mintGcpToken(serviceAccountJson: string): Promise<GcpToken> {
  const credentials = JSON.parse(serviceAccountJson);
  const auth = new GoogleAuth({
    credentials,
    scopes: [GCP_SCOPE],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error('Failed to mint GCP access token from service account');
  }
  // GCP access tokens typically expire in 3600 seconds
  // Use a conservative 55-minute TTL for caching
  return {
    accessToken: tokenResponse.token,
    expiresInSeconds: 3300, // 55 minutes
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add server/gcp-token.ts server/token-cache.ts server/token-cache.test.ts
git commit -m "feat: add GCP token minting and in-memory token cache"
```

---

## Task 4: Database Schema (org_credential + project tables)

**Files:**
- Modify: `server/schema.ts`
- Modify: `server/db.ts`

- [ ] **Step 1: Add new table definitions to schema**

Modify `server/schema.ts` — add `orgCredential` and `project` tables alongside the existing `savedStore`:

```typescript
// ABOUTME: Drizzle schema for all database tables.
// ABOUTME: Includes saved_store (deprecated), org_credential, and project tables.
import { integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const savedStore = pgTable('saved_store', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userEmail: text('user_email').notNull(),
  name: text('name').notNull(),
  gcpProject: text('gcp_project').notNull(),
  gcpLocation: text('gcp_location').notNull(),
  gcpDataset: text('gcp_dataset').notNull(),
  gcpFhirStore: text('gcp_fhir_store').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique('saved_store_user_email_name_unique').on(table.userEmail, table.name),
]);

export const orgCredential = pgTable('org_credential', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().unique(),
  encryptedServiceAccount: text('encrypted_service_account').notNull(),
  encryptedDek: text('encrypted_dek').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  dekIv: text('dek_iv').notNull(),
  dekAuthTag: text('dek_auth_tag').notNull(),
  keyVersion: integer('key_version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const project = pgTable('project', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  organizationId: text('organization_id').notNull(),
  gcpProject: text('gcp_project').notNull(),
  gcpLocation: text('gcp_location').notNull(),
  gcpDataset: text('gcp_dataset').notNull(),
  gcpFhirStore: text('gcp_fhir_store').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique('project_org_slug_unique').on(table.organizationId, table.slug),
]);
```

- [ ] **Step 2: Update ensureTables() in db.ts**

Modify `server/db.ts` — add CREATE TABLE statements for the new tables. Add them after the existing `saved_store` creation:

```typescript
export async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "saved_store" (
      "id" text PRIMARY KEY NOT NULL,
      "user_email" text NOT NULL,
      "name" text NOT NULL,
      "gcp_project" text NOT NULL,
      "gcp_location" text NOT NULL,
      "gcp_dataset" text NOT NULL,
      "gcp_fhir_store" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "saved_store_user_email_name_unique" UNIQUE("user_email","name")
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "org_credential" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL UNIQUE,
      "encrypted_service_account" text NOT NULL,
      "encrypted_dek" text NOT NULL,
      "iv" text NOT NULL,
      "auth_tag" text NOT NULL,
      "dek_iv" text NOT NULL,
      "dek_auth_tag" text NOT NULL,
      "key_version" integer NOT NULL DEFAULT 1,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "project" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "slug" text NOT NULL,
      "description" text,
      "organization_id" text NOT NULL,
      "gcp_project" text NOT NULL,
      "gcp_location" text NOT NULL,
      "gcp_dataset" text NOT NULL,
      "gcp_fhir_store" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "project_org_slug_unique" UNIQUE("organization_id","slug")
    );
  `);
}
```

- [ ] **Step 3: Generate Drizzle migration**

```bash
bun run db:generate
```

Expected: Migration files generated in `drizzle/` directory.

- [ ] **Step 4: Commit**

```bash
git add server/schema.ts server/db.ts drizzle/
git commit -m "feat: add org_credential and project database tables"
```

---

## Task 5: Better Auth Server Configuration

**Files:**
- Create: `server/auth.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create Better Auth server instance**

Create `server/auth.ts`:

```typescript
// ABOUTME: Better Auth server instance with Google social login and organization plugin.
// ABOUTME: Manages user sessions, org membership, and invitations.
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
    }),
  ],
});
```

Note: We do NOT request `cloud-platform` scope from the user's Google OAuth. Users only sign in for identity verification. GCP access comes from the org's service account.

- [ ] **Step 2: Update .env.example**

Add new environment variables to `.env.example`:

```bash
# Auth (Better Auth — replaces VITE_GOOGLE_CLIENT_ID)
BETTER_AUTH_SECRET=<random-secret-for-sessions>
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>

# Encryption
CINDER_ENCRYPTION_KEY=<32-byte-base64-master-key>
```

Keep the existing `VITE_*` vars with a comment noting they're for dev proxy mode only.

- [ ] **Step 3: Verify Better Auth generates its tables**

Better Auth auto-creates its tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) on first request. To verify:

```bash
# Start the server (requires DATABASE_URL, BETTER_AUTH_SECRET set)
# Tables will be created when the first /api/auth/* request hits
```

This can be tested manually during integration. Better Auth handles its own migrations.

- [ ] **Step 4: Commit**

```bash
git add server/auth.ts .env.example
git commit -m "feat: configure Better Auth with Google social login and org plugin"
```

---

## Task 6: Server Middleware Helpers

**Files:**
- Create: `server/middleware.ts`

These helpers extract session info and verify org membership/ownership. Used by all API route handlers.

- [ ] **Step 1: Create middleware helpers**

Create `server/middleware.ts`:

```typescript
// ABOUTME: Shared middleware helpers for API route handlers.
// ABOUTME: Provides session validation, org membership checks, and owner authorization.
import { auth } from './auth';

export interface SessionInfo {
  userId: string;
  email: string;
}

export async function getSession(req: Request): Promise<SessionInfo | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
  };
}

export async function requireSession(req: Request): Promise<SessionInfo> {
  const session = await getSession(req);
  if (!session) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return session;
}

export interface MemberInfo extends SessionInfo {
  orgId: string;
  role: string;
}

export async function requireOrgMember(req: Request, orgId: string): Promise<MemberInfo> {
  const session = await requireSession(req);
  const member = await auth.api.getFullOrganization({
    headers: req.headers,
    query: { organizationId: orgId },
  });
  if (!member) {
    throw new Response(JSON.stringify({ error: 'Organization not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const userMember = member.members.find((m: any) => m.userId === session.userId);
  if (!userMember) {
    throw new Response(JSON.stringify({ error: 'Not a member of this organization' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { ...session, orgId, role: userMember.role };
}

export async function requireOrgOwner(req: Request, orgId: string): Promise<MemberInfo> {
  const member = await requireOrgMember(req, orgId);
  if (member.role !== 'owner') {
    throw new Response(JSON.stringify({ error: 'Owner access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return member;
}
```

Note: The exact Better Auth API calls may need adjustment based on the library's actual API surface. The middleware throws `Response` objects which the server.ts handler catches and returns directly.

- [ ] **Step 2: Commit**

```bash
git add server/middleware.ts
git commit -m "feat: add session and org membership middleware helpers"
```

---

## Task 7: Credential API Routes

**Files:**
- Create: `server/routes/credentials.ts`
- Create: `server/routes/credentials.test.ts`

- [ ] **Step 1: Write credential route tests**

Create `server/routes/credentials.test.ts`:

```typescript
// ABOUTME: Tests for credential upload and status API endpoints.
// ABOUTME: Verifies validation, encryption, and metadata-only responses.
import { describe, expect, it } from 'vitest';
import { validateServiceAccountJson } from './credentials';

describe('validateServiceAccountJson', () => {
  it('accepts valid service account JSON', () => {
    const valid = JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      private_key_id: 'key-123',
      private_key: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
      client_email: 'test@test-project.iam.gserviceaccount.com',
    });
    expect(() => validateServiceAccountJson(valid)).not.toThrow();
  });

  it('rejects non-service-account type', () => {
    const invalid = JSON.stringify({ type: 'authorized_user', project_id: 'test' });
    expect(() => validateServiceAccountJson(invalid)).toThrow('type must be "service_account"');
  });

  it('rejects missing required fields', () => {
    const missing = JSON.stringify({ type: 'service_account' });
    expect(() => validateServiceAccountJson(missing)).toThrow();
  });

  it('rejects input over 10KB', () => {
    const large = JSON.stringify({
      type: 'service_account',
      project_id: 'test',
      private_key_id: 'key',
      private_key: 'x'.repeat(11000),
      client_email: 'test@test.iam.gserviceaccount.com',
    });
    expect(() => validateServiceAccountJson(large)).toThrow('10KB');
  });

  it('rejects invalid JSON', () => {
    expect(() => validateServiceAccountJson('not json')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun vitest run server/routes/credentials.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement credential routes**

Create `server/routes/credentials.ts`:

```typescript
// ABOUTME: API handlers for uploading and checking org service account credentials.
// ABOUTME: Validates, encrypts, and stores service account JSON; returns metadata only on GET.
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
    throw new Error('Service account JSON must be under 10KB');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON');
  }

  if (parsed.type !== 'service_account') {
    throw new Error('type must be "service_account"');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!parsed[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
}

export async function handlePutCredential(req: Request, orgId: string): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = await req.text();
  try {
    validateServiceAccountJson(body);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  const masterKey = getMasterKey();
  const encrypted = encryptCredential(body, masterKey);

  // Upsert: insert or replace existing credential for this org
  const existing = await db.select({ id: orgCredential.id })
    .from(orgCredential)
    .where(eq(orgCredential.organizationId, orgId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(orgCredential)
      .set({
        encryptedServiceAccount: encrypted.encryptedServiceAccount,
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        dekIv: encrypted.dekIv,
        dekAuthTag: encrypted.dekAuthTag,
        keyVersion: encrypted.keyVersion,
        updatedAt: new Date(),
      })
      .where(eq(orgCredential.organizationId, orgId));
  } else {
    await db.insert(orgCredential).values({
      organizationId: orgId,
      encryptedServiceAccount: encrypted.encryptedServiceAccount,
      encryptedDek: encrypted.encryptedDek,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      dekIv: encrypted.dekIv,
      dekAuthTag: encrypted.dekAuthTag,
      keyVersion: encrypted.keyVersion,
    });
  }

  // Evict cached token so new requests use the new credential
  tokenCache.evict(orgId);

  return Response.json({ ok: true }, { status: 200 });
}

export async function handleGetCredentialStatus(req: Request, orgId: string): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const rows = await db.select({
    createdAt: orgCredential.createdAt,
    updatedAt: orgCredential.updatedAt,
  })
    .from(orgCredential)
    .where(eq(orgCredential.organizationId, orgId))
    .limit(1);

  if (rows.length === 0) {
    return Response.json({ configured: false }, { status: 200 });
  }

  return Response.json({
    configured: true,
    createdAt: rows[0]!.createdAt,
    updatedAt: rows[0]!.updatedAt,
  }, { status: 200 });
}
```

Create `server/routes/shared.ts`:

```typescript
// ABOUTME: Shared singleton instances used across route handlers.
// ABOUTME: Exports the token cache instance to avoid circular dependencies.
import { TokenCache } from '../token-cache';

export const tokenCache = new TokenCache();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun vitest run server/routes/credentials.test.ts
```

Expected: All 5 tests PASS (validation tests don't need DB).

- [ ] **Step 5: Commit**

```bash
git add server/routes/credentials.ts server/routes/credentials.test.ts server/routes/shared.ts
git commit -m "feat: add credential upload and status API endpoints"
```

---

## Task 8: Project API Routes

**Files:**
- Create: `server/routes/projects.ts`
- Create: `server/routes/projects.test.ts`

- [ ] **Step 1: Write project validation tests**

Create `server/routes/projects.test.ts`:

```typescript
// ABOUTME: Tests for project CRUD API route validation logic.
// ABOUTME: Verifies slug generation and input validation.
import { describe, expect, it } from 'vitest';
import { validateProjectInput, slugify } from './projects';

describe('slugify', () => {
  it('converts name to lowercase slug', () => {
    expect(slugify('My FHIR Store')).toBe('my-fhir-store');
  });

  it('removes special characters', () => {
    expect(slugify('Test (Prod) #1')).toBe('test-prod-1');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('a - - b')).toBe('a-b');
  });

  it('trims leading/trailing dashes', () => {
    expect(slugify('--hello--')).toBe('hello');
  });
});

describe('validateProjectInput', () => {
  const valid = {
    name: 'My Project',
    gcpProject: 'my-gcp-project',
    gcpLocation: 'us-central1',
    gcpDataset: 'my-dataset',
    gcpFhirStore: 'my-store',
  };

  it('accepts valid input', () => {
    expect(() => validateProjectInput(valid)).not.toThrow();
  });

  it('rejects missing name', () => {
    expect(() => validateProjectInput({ ...valid, name: '' })).toThrow();
  });

  it('rejects missing gcpProject', () => {
    expect(() => validateProjectInput({ ...valid, gcpProject: '' })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun vitest run server/routes/projects.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement project routes**

Create `server/routes/projects.ts`:

```typescript
// ABOUTME: API handlers for project CRUD operations.
// ABOUTME: Projects map to FHIR stores within an organization.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { project } from '../schema';
import { requireOrgMember, requireOrgOwner } from '../middleware';

const projectInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  slug: z.string().optional(),
  description: z.string().optional(),
  gcpProject: z.string().min(1, 'GCP project is required'),
  gcpLocation: z.string().min(1, 'GCP location is required'),
  gcpDataset: z.string().min(1, 'GCP dataset is required'),
  gcpFhirStore: z.string().min(1, 'GCP FHIR store is required'),
});

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function validateProjectInput(input: unknown): z.infer<typeof projectInputSchema> {
  return projectInputSchema.parse(input);
}

export async function handleListProjects(req: Request, orgId: string): Promise<Response> {
  try {
    await requireOrgMember(req, orgId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const projects = await db.select()
    .from(project)
    .where(eq(project.organizationId, orgId))
    .orderBy(project.name);

  return Response.json(projects);
}

export async function handleCreateProject(req: Request, orgId: string): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let input: z.infer<typeof projectInputSchema>;
  try {
    const body = await req.json();
    input = validateProjectInput(body);
  } catch (e: any) {
    return Response.json({ error: e.message ?? 'Invalid input' }, { status: 400 });
  }

  const slug = input.slug || slugify(input.name);

  try {
    const [created] = await db.insert(project).values({
      name: input.name,
      slug,
      description: input.description,
      organizationId: orgId,
      gcpProject: input.gcpProject,
      gcpLocation: input.gcpLocation,
      gcpDataset: input.gcpDataset,
      gcpFhirStore: input.gcpFhirStore,
    }).returning();

    return Response.json(created, { status: 201 });
  } catch (e: any) {
    if (e.code === '23505') { // unique constraint violation
      return Response.json({ error: 'A project with this slug already exists in this organization' }, { status: 409 });
    }
    throw e;
  }
}

export async function handleGetProject(req: Request, projectId: string): Promise<Response> {
  const [row] = await db.select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);

  if (!row) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    await requireOrgMember(req, row.organizationId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  return Response.json(row);
}

export async function handleUpdateProject(req: Request, projectId: string): Promise<Response> {
  const [row] = await db.select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);

  if (!row) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    await requireOrgOwner(req, row.organizationId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let input: z.infer<typeof projectInputSchema>;
  try {
    const body = await req.json();
    input = validateProjectInput(body);
  } catch (e: any) {
    return Response.json({ error: e.message ?? 'Invalid input' }, { status: 400 });
  }

  const [updated] = await db.update(project)
    .set({
      name: input.name,
      description: input.description,
      gcpProject: input.gcpProject,
      gcpLocation: input.gcpLocation,
      gcpDataset: input.gcpDataset,
      gcpFhirStore: input.gcpFhirStore,
      updatedAt: new Date(),
    })
    .where(eq(project.id, projectId))
    .returning();

  return Response.json(updated);
}

export async function handleDeleteProject(req: Request, projectId: string): Promise<Response> {
  const [row] = await db.select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);

  if (!row) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    await requireOrgOwner(req, row.organizationId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  await db.delete(project).where(eq(project.id, projectId));
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun vitest run server/routes/projects.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/projects.ts server/routes/projects.test.ts
git commit -m "feat: add project CRUD API endpoints"
```

---

## Task 9: Direct-Add Members Route

**Files:**
- Create: `server/routes/members.ts`

- [ ] **Step 1: Implement direct-add member endpoint**

Create `server/routes/members.ts`:

```typescript
// ABOUTME: API handler for directly adding members to an organization by email.
// ABOUTME: Creates a stub user if needed, then adds as member. Bypasses invitation flow.
import { requireOrgOwner } from '../middleware';
import { auth } from '../auth';
import { z } from 'zod';

const addMemberSchema = z.object({
  email: z.string().email('Valid email required'),
  role: z.enum(['member', 'owner']).default('member'),
});

export async function handleDirectAddMember(req: Request, orgId: string): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let input: z.infer<typeof addMemberSchema>;
  try {
    const body = await req.json();
    input = addMemberSchema.parse(body);
  } catch (e: any) {
    return Response.json({ error: e.message ?? 'Invalid input' }, { status: 400 });
  }

  try {
    // Use Better Auth's organization API to add member
    // This will create an invitation or direct-add depending on config
    const result = await auth.api.addMember({
      body: {
        organizationId: orgId,
        userId: input.email, // Better Auth resolves by email
        role: input.role,
      },
      headers: req.headers,
    });

    return Response.json(result, { status: 201 });
  } catch (e: any) {
    // If user doesn't exist yet, create invitation instead
    try {
      const result = await auth.api.createInvitation({
        body: {
          organizationId: orgId,
          email: input.email,
          role: input.role,
        },
        headers: req.headers,
      });
      return Response.json(result, { status: 201 });
    } catch (inviteErr: any) {
      return Response.json({ error: inviteErr.message ?? 'Failed to add member' }, { status: 400 });
    }
  }
}
```

Note: The exact Better Auth API for adding members may differ. The implementation should be verified against the Better Auth docs during development. The key behavior is: try direct add first, fall back to invitation if user doesn't exist yet.

- [ ] **Step 2: Commit**

```bash
git add server/routes/members.ts
git commit -m "feat: add direct-add member API endpoint"
```

---

## Task 10: Rewrite server.ts with New Routes + FHIR Proxy

**Files:**
- Modify: `server.ts`

This is the biggest server-side change. Replace the store-based routes with auth/org/project/credential routes and rewrite the FHIR proxy.

- [ ] **Step 1: Rewrite server.ts**

The new server.ts should:

1. Route `/api/auth/*` to Better Auth
2. Route `/api/orgs/:id/credential` to credential handlers
3. Route `/api/orgs/:id/projects` to project handlers
4. Route `/api/orgs/:id/members` to member handlers
5. Route `/api/projects/:id` to project handlers
6. Rewrite `/fhir/*` proxy to use session + project ID + org service account
7. Remove old `/api/stores` routes
8. Keep static file serving + SPA fallback

Key changes to the FHIR proxy (replace `handleFhirProxy`):

```typescript
async function handleFhirProxy(req: Request, url: URL): Promise<Response> {
  const projectId = req.headers.get('X-Project-Id');
  if (!projectId) {
    return Response.json(
      { error: 'X-Project-Id header is required' },
      { status: 400 }
    );
  }

  // Validate session
  const session = await getSession(req);
  if (!session) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Look up project
  const [proj] = await db.select()
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);

  if (!proj) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  // Verify org membership
  try {
    await requireOrgMember(req, proj.organizationId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  // Get or mint GCP access token
  let gcpToken = tokenCache.get(proj.organizationId);
  if (!gcpToken) {
    // Decrypt service account credential
    const [cred] = await db.select()
      .from(orgCredentialTable)
      .where(eq(orgCredentialTable.organizationId, proj.organizationId))
      .limit(1);

    if (!cred) {
      return Response.json(
        { error: 'Organization has no service account configured' },
        { status: 503 }
      );
    }

    try {
      const masterKey = getMasterKey(cred.keyVersion);
      const serviceAccountJson = decryptCredential(cred, masterKey);
      const token = await mintGcpToken(serviceAccountJson);
      tokenCache.set(proj.organizationId, token.accessToken, token.expiresInSeconds);
      gcpToken = token.accessToken;
    } catch (e) {
      console.error('Failed to mint GCP token:', e);
      tokenCache.evict(proj.organizationId);
      return Response.json(
        { error: 'Failed to authenticate to GCP — service account may be invalid or revoked' },
        { status: 502 }
      );
    }
  }

  // Build target URL
  const storeBaseUrl = `https://healthcare.googleapis.com/v1/projects/${proj.gcpProject}/locations/${proj.gcpLocation}/datasets/${proj.gcpDataset}/fhirStores/${proj.gcpFhirStore}`;
  const targetUrl = `${storeBaseUrl}${url.pathname}${url.search.replace(/_cursor=/g, '_page_token=')}`;

  // Proxy the request
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${gcpToken}`);
  const contentType = req.headers.get('Content-Type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.body,
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('Content-Encoding');
  responseHeaders.delete('Content-Length');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
```

Update the main `fetch` handler to route to the new endpoints. Remove the `/api/stores` routes. Add Better Auth handler for `/api/auth/*`.

- [ ] **Step 2: Update CSP header**

Remove `https://accounts.google.com` from `script-src` (no longer loading GIS client-side). Keep `https://accounts.google.com` in `connect-src` for Better Auth's server-side redirect.

- [ ] **Step 3: Verify server starts**

```bash
bun run start
```

Expected: Server starts on port 3000 (requires env vars set). Check that `/api/auth/session` returns a response.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: rewrite server with Better Auth routes and org-based FHIR proxy"
```

---

## Task 11: Update Vite Dev Config

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add /api proxy for dev server**

The dev server needs to proxy `/api/*` requests to the Bun server running on port 3000 (run `bun run start` alongside `bun run dev`).

Add to the `server.proxy` config in `vite.config.ts`:

```typescript
'/api': {
  target: 'http://localhost:3000',
  changeOrigin: true,
},
```

Keep the existing `/fhir` proxy for dev proxy mode (service-account.json). The FHIR proxy in dev can work two ways:
1. **Dev proxy mode** (no Better Auth): existing Vite proxy with service-account.json
2. **Full auth mode**: through the Bun server's FHIR proxy

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add /api proxy to Vite dev server config"
```

---

## Task 12: Better Auth Client + New AuthProvider

**Files:**
- Create: `src/auth/auth-client.ts`
- Rewrite: `src/auth/AuthProvider.tsx`

- [ ] **Step 1: Create Better Auth client**

Create `src/auth/auth-client.ts`:

```typescript
// ABOUTME: Better Auth React client with organization plugin.
// ABOUTME: Provides hooks for session, sign-in/out, and org management.
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
```

- [ ] **Step 2: Rewrite AuthProvider to use Better Auth**

Rewrite `src/auth/AuthProvider.tsx`:

```typescript
// ABOUTME: React context provider for authentication state using Better Auth.
// ABOUTME: Exposes session info, sign-in/sign-out, and org management to child components.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { JSX } from 'react';
import { authClient } from './auth-client';

interface AuthContextValue {
  isAuthenticated: boolean;
  userId: string | undefined;
  email: string | undefined;
  signIn: () => void;
  signOut: () => void;
  session: ReturnType<typeof authClient.useSession>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  readonly children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const session = authClient.useSession();

  const signIn = useCallback(() => {
    authClient.signIn.social({ provider: 'google' });
  }, []);

  const signOut = useCallback(() => {
    authClient.signOut();
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated: !!session.data?.user,
      userId: session.data?.user?.id,
      email: session.data?.user?.email,
      signIn,
      signOut,
      session,
    }),
    [session, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/auth/auth-client.ts src/auth/AuthProvider.tsx
git commit -m "feat: replace Google OAuth implicit flow with Better Auth client"
```

---

## Task 13: Organization Context

**Files:**
- Create: `src/contexts/OrgContext.tsx`

This context manages the active org and project selection, stored in localStorage for persistence.

- [ ] **Step 1: Create OrgContext**

Create `src/contexts/OrgContext.tsx`:

```typescript
// ABOUTME: React context for active organization and project selection.
// ABOUTME: Persists selections in localStorage and provides org/project data to the app.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { JSX } from 'react';
import { authClient } from '../auth/auth-client';

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  organizationId: string;
  gcpProject: string;
  gcpLocation: string;
  gcpDataset: string;
  gcpFhirStore: string;
}

interface OrgContextValue {
  activeOrgId: string | undefined;
  activeOrgSlug: string | undefined;
  activeProject: Project | undefined;
  projects: Project[];
  setActiveOrg: (orgId: string) => void;
  setActiveProject: (project: Project) => void;
  refreshProjects: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

const ACTIVE_ORG_KEY = 'cinder:active-org';
const ACTIVE_PROJECT_KEY = 'cinder:active-project';

interface OrgProviderProps {
  readonly children: ReactNode;
}

export function OrgProvider({ children }: OrgProviderProps): JSX.Element {
  const [activeOrgId, setActiveOrgIdState] = useState<string | undefined>(() => {
    return localStorage.getItem(ACTIVE_ORG_KEY) ?? undefined;
  });
  const [activeProject, setActiveProjectState] = useState<Project | undefined>(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_PROJECT_KEY);
      return raw ? JSON.parse(raw) : undefined;
    } catch { return undefined; }
  });
  const [projects, setProjects] = useState<Project[]>([]);

  const activeOrg = authClient.useActiveOrganization();
  const activeOrgSlug = activeOrg.data?.slug;

  const setActiveOrg = useCallback((orgId: string) => {
    setActiveOrgIdState(orgId);
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    // Clear project when switching orgs
    setActiveProjectState(undefined);
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    authClient.organization.setActive({ organizationId: orgId });
  }, []);

  const setActiveProject = useCallback((project: Project) => {
    setActiveProjectState(project);
    localStorage.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(project));
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!activeOrgId) {
      setProjects([]);
      return;
    }
    const response = await fetch(`/api/orgs/${activeOrgId}/projects`, {
      credentials: 'include',
    });
    if (response.ok) {
      const data = await response.json();
      setProjects(data);
    }
  }, [activeOrgId]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const value = useMemo(
    () => ({
      activeOrgId,
      activeOrgSlug,
      activeProject,
      projects,
      setActiveOrg,
      setActiveProject,
      refreshProjects,
    }),
    [activeOrgId, activeOrgSlug, activeProject, projects, setActiveOrg, setActiveProject, refreshProjects]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error('useOrg must be used within OrgProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contexts/OrgContext.tsx
git commit -m "feat: add OrgContext for active org and project management"
```

---

## Task 14: Update MedplumClient Adapter

**Files:**
- Modify: `src/fhir/medplum-adapter.ts`

- [ ] **Step 1: Update adapter to use session cookie + X-Project-Id**

Replace the `HealthcareMedplumClientConfig` interface and constructor. The client no longer sends Bearer tokens or `X-Store-Base`. Instead it sends credentials (cookie) and the `X-Project-Id` header.

```typescript
// ABOUTME: MedplumClient subclass that routes FHIR operations through the proxy.
// ABOUTME: Overrides schema and ValueSet methods for local-first operation.
import { MedplumClient, ReadablePromise, normalizeCreateBinaryOptions } from '@medplum/core';
import type { BinarySource, CreateBinaryOptions, MedplumRequestOptions, ValueSetExpandParams } from '@medplum/core';
import type { Attachment, ValueSet } from '@medplum/fhirtypes';
import { loadSchemas } from '../schemas';
import { expandValueSet } from './valuesets';

export interface HealthcareMedplumClientConfig {
  projectId?: string;
  onUnauthenticated?: () => void;
}

export class HealthcareMedplumClient extends MedplumClient {
  constructor(config: HealthcareMedplumClientConfig) {
    const projectId = config.projectId;
    const onUnauthenticated = config.onUnauthenticated;

    super({
      baseUrl: globalThis.location?.origin ?? 'http://localhost:5173',
      fhirUrlPath: 'fhir',
      fetch: async (url: string | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (projectId) {
          headers.set('X-Project-Id', projectId);
        }
        const response = await fetch(url, {
          ...init,
          headers,
          credentials: 'include', // send session cookie
        });
        if (response.status === 401 && onUnauthenticated) {
          onUnauthenticated();
        }
        return response;
      },
    });
  }

  // ... keep existing override methods unchanged (requestSchema, requestProfileSchema, createAttachment, valueSetExpand)
}
```

- [ ] **Step 2: Update FhirProvider in AppProviders.tsx**

The `FhirProvider` now uses `projectId` instead of `accessToken` + `storeConfig`:

```typescript
export function FhirProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const { signOut } = useAuth();
  const { activeProject } = useOrg();
  const navigate = useNavigate();

  const medplum = useMemo(() => {
    return new HealthcareMedplumClient({
      projectId: activeProject?.id,
      onUnauthenticated: signOut,
    });
  }, [activeProject?.id, signOut]);

  return (
    <MedplumProvider medplum={medplum} navigate={navigate}>
      {children}
    </MedplumProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/fhir/medplum-adapter.ts src/AppProviders.tsx
git commit -m "feat: update FHIR client to use session cookie and X-Project-Id header"
```

---

## Task 15: OrgSwitcher + ProjectSwitcher Components

**Files:**
- Create: `src/components/OrgSwitcher.tsx`
- Create: `src/components/ProjectSwitcher.tsx`

- [ ] **Step 1: Create OrgSwitcher**

Create `src/components/OrgSwitcher.tsx`:

```typescript
// ABOUTME: Dropdown component for switching between organizations.
// ABOUTME: Lists user's orgs and provides a link to create a new one.
import { Menu, Button, Text } from '@mantine/core';
import { IconBuilding, IconChevronDown, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { authClient } from '../auth/auth-client';
import { useOrg } from '../contexts/OrgContext';

export function OrgSwitcher(): JSX.Element {
  const { activeOrgId, activeOrgSlug, setActiveOrg } = useOrg();
  const orgs = authClient.useListOrganizations();

  const activeOrgName = orgs.data?.find((o: any) => o.id === activeOrgId)?.name ?? 'Select Org';

  return (
    <Menu>
      <Menu.Target>
        <Button variant="subtle" size="compact-sm" rightSection={<IconChevronDown size={14} />} leftSection={<IconBuilding size={16} />}>
          {activeOrgName}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {orgs.data?.map((org: any) => (
          <Menu.Item
            key={org.id}
            onClick={() => setActiveOrg(org.id)}
            fw={org.id === activeOrgId ? 700 : 400}
          >
            {org.name}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          component={Link}
          to="/orgs/new"
          leftSection={<IconPlus size={14} />}
        >
          Create Organization
        </Menu.Item>
        {activeOrgSlug && (
          <Menu.Item
            component={Link}
            to={`/orgs/${activeOrgSlug}/settings`}
          >
            <Text size="sm">Org Settings</Text>
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
```

- [ ] **Step 2: Create ProjectSwitcher**

Create `src/components/ProjectSwitcher.tsx`:

```typescript
// ABOUTME: Dropdown component for switching between projects within an org.
// ABOUTME: Lists available projects and provides a link to create a new one.
import { Menu, Button, Text } from '@mantine/core';
import { IconChevronDown, IconDatabase, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { useOrg } from '../contexts/OrgContext';

export function ProjectSwitcher(): JSX.Element {
  const { activeOrgSlug, activeProject, projects, setActiveProject } = useOrg();

  if (!activeOrgSlug) return <></>;

  return (
    <Menu>
      <Menu.Target>
        <Button variant="subtle" size="compact-sm" rightSection={<IconChevronDown size={14} />} leftSection={<IconDatabase size={16} />}>
          {activeProject?.name ?? 'Select Project'}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {projects.map((p) => (
          <Menu.Item
            key={p.id}
            onClick={() => setActiveProject(p)}
            fw={p.id === activeProject?.id ? 700 : 400}
          >
            <Text size="sm">{p.name}</Text>
            <Text size="xs" c="dimmed">{p.gcpProject}/{p.gcpFhirStore}</Text>
          </Menu.Item>
        ))}
        {projects.length === 0 && (
          <Menu.Item disabled>No projects yet</Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item
          component={Link}
          to={`/orgs/${activeOrgSlug}/projects/new`}
          leftSection={<IconPlus size={14} />}
        >
          Create Project
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/OrgSwitcher.tsx src/components/ProjectSwitcher.tsx
git commit -m "feat: add OrgSwitcher and ProjectSwitcher dropdown components"
```

---

## Task 16: Org Management Pages

**Files:**
- Create: `src/pages/CreateOrgPage.tsx`
- Create: `src/pages/OrgSettingsPage.tsx`

- [ ] **Step 1: Create CreateOrgPage**

Create `src/pages/CreateOrgPage.tsx`:

```typescript
// ABOUTME: Page for creating a new organization.
// ABOUTME: Simple form with name field; slug is auto-generated.
import { Button, Center, Stack, TextInput, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { authClient } from '../auth/auth-client';
import { useOrg } from '../contexts/OrgContext';

export function CreateOrgPage(): JSX.Element {
  const navigate = useNavigate();
  const { setActiveOrg } = useOrg();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authClient.organization.create({
        name,
        slug,
      });
      if (result.data) {
        setActiveOrg(result.data.id);
        navigate(`/orgs/${result.data.slug}/settings`);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h="100vh">
      <Stack w={400} gap="md">
        <Title order={2}>Create Organization</Title>
        <TextInput label="Name" value={name} onChange={(e) => handleNameChange(e.currentTarget.value)} />
        <TextInput label="Slug" value={slug} onChange={(e) => setSlug(e.currentTarget.value)} description="URL-friendly identifier" />
        {error && <Text c="red" size="sm">{error}</Text>}
        <Button onClick={handleSubmit} loading={loading} disabled={!name || !slug}>
          Create Organization
        </Button>
      </Stack>
    </Center>
  );
}
```

Note: Missing `Text` import — add to the Mantine import line.

- [ ] **Step 2: Create OrgSettingsPage**

Create `src/pages/OrgSettingsPage.tsx`:

```typescript
// ABOUTME: Organization settings page with tabs for members and credentials.
// ABOUTME: Allows owners to manage team members and upload service account JSON.
import {
  ActionIcon, Badge, Button, Card, Divider, FileInput, Group, Stack,
  Table, Tabs, Text, TextInput, Title,
} from '@mantine/core';
import { IconTrash, IconUpload, IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { authClient } from '../auth/auth-client';
import { useOrg } from '../contexts/OrgContext';

export function OrgSettingsPage(): JSX.Element {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { activeOrgId } = useOrg();

  return (
    <Stack gap="lg" p="md">
      <Title order={2}>Organization Settings</Title>
      <Tabs defaultValue="members">
        <Tabs.List>
          <Tabs.Tab value="members">Members</Tabs.Tab>
          <Tabs.Tab value="credentials">Service Account</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="members" pt="md">
          <MembersTab orgId={activeOrgId} />
        </Tabs.Panel>
        <Tabs.Panel value="credentials" pt="md">
          <CredentialsTab orgId={activeOrgId} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function MembersTab({ orgId }: { readonly orgId: string | undefined }): JSX.Element {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    if (!orgId) return;
    authClient.organization.getFullOrganization({ query: { organizationId: orgId } })
      .then((result: any) => {
        if (result.data?.members) setMembers(result.data.members);
      });
  }, [orgId]);

  const handleAdd = async () => {
    if (!orgId || !email) return;
    setLoading(true);
    try {
      await fetch(`/api/orgs/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      setEmail('');
      // Refresh members
      const result = await authClient.organization.getFullOrganization({ query: { organizationId: orgId } });
      if (result.data?.members) setMembers(result.data.members);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="md">
      <Group>
        <TextInput placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.currentTarget.value)} style={{ flex: 1 }} />
        <Button onClick={handleAdd} loading={loading} disabled={!email}>Add Member</Button>
      </Group>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Email</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {members.map((m: any) => (
            <Table.Tr key={m.id}>
              <Table.Td>{m.user?.email ?? m.email}</Table.Td>
              <Table.Td><Badge size="sm">{m.role}</Badge></Table.Td>
              <Table.Td>
                {m.role !== 'owner' && (
                  <ActionIcon variant="subtle" color="red" size="sm">
                    <IconTrash size={14} />
                  </ActionIcon>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function CredentialsTab({ orgId }: { readonly orgId: string | undefined }): JSX.Element {
  const [status, setStatus] = useState<{ configured: boolean; updatedAt?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/orgs/${orgId}/credential`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setStatus);
  }, [orgId]);

  const handleUpload = async (file: File | null) => {
    if (!file || !orgId) return;
    setUploading(true);
    setMessage('');
    try {
      const text = await file.text();
      const response = await fetch(`/api/orgs/${orgId}/credential`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: text,
      });
      if (response.ok) {
        setMessage('Service account uploaded successfully');
        setStatus({ configured: true, updatedAt: new Date().toISOString() });
      } else {
        const err = await response.json();
        setMessage(`Error: ${err.error}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Stack gap="md">
      <Card withBorder p="md">
        <Group>
          {status?.configured ? (
            <>
              <IconCheck size={20} color="green" />
              <Text>Service account configured (updated {status.updatedAt ? new Date(status.updatedAt).toLocaleDateString() : 'unknown'})</Text>
            </>
          ) : (
            <Text c="dimmed">No service account configured</Text>
          )}
        </Group>
      </Card>
      <FileInput
        label="Upload service account JSON"
        placeholder="Choose file..."
        accept=".json"
        leftSection={<IconUpload size={16} />}
        onChange={handleUpload}
        disabled={uploading}
      />
      {message && <Text size="sm" c={message.startsWith('Error') ? 'red' : 'green'}>{message}</Text>}
    </Stack>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/CreateOrgPage.tsx src/pages/OrgSettingsPage.tsx
git commit -m "feat: add CreateOrgPage and OrgSettingsPage with members and credentials tabs"
```

---

## Task 17: Project Management Pages

**Files:**
- Create: `src/pages/ProjectsPage.tsx`
- Create: `src/pages/CreateProjectPage.tsx`

- [ ] **Step 1: Create ProjectsPage**

Create `src/pages/ProjectsPage.tsx`:

```typescript
// ABOUTME: Page listing all projects for the current organization.
// ABOUTME: Displays project cards with FHIR store details and navigation.
import { Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconDatabase, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { useOrg } from '../contexts/OrgContext';

export function ProjectsPage(): JSX.Element {
  const { activeOrgSlug, projects, setActiveProject } = useOrg();

  return (
    <Stack gap="lg" p="md">
      <Group justify="space-between">
        <Title order={2}>Projects</Title>
        <Button component={Link} to={`/orgs/${activeOrgSlug}/projects/new`} leftSection={<IconPlus size={16} />}>
          New Project
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        {projects.map((p) => (
          <Card key={p.id} withBorder padding="md" component={Link} to={`/orgs/${activeOrgSlug}/projects/${p.slug}`} onClick={() => setActiveProject(p)} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Group gap="sm" mb="xs">
              <IconDatabase size={20} />
              <Text fw={600}>{p.name}</Text>
            </Group>
            {p.description && <Text size="sm" c="dimmed" mb="xs">{p.description}</Text>}
            <Text size="xs" c="dimmed">{p.gcpProject} / {p.gcpDataset} / {p.gcpFhirStore}</Text>
          </Card>
        ))}
      </SimpleGrid>
      {projects.length === 0 && (
        <Text c="dimmed" ta="center">No projects yet. Create one to get started.</Text>
      )}
    </Stack>
  );
}
```

- [ ] **Step 2: Create CreateProjectPage**

Create `src/pages/CreateProjectPage.tsx`:

```typescript
// ABOUTME: Page for creating a new project (FHIR store configuration) within an org.
// ABOUTME: Form for name, GCP project, location, dataset, and FHIR store.
import { Button, Stack, TextInput, Textarea, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useOrg } from '../contexts/OrgContext';

export function CreateProjectPage(): JSX.Element {
  const navigate = useNavigate();
  const { activeOrgId, activeOrgSlug, refreshProjects } = useOrg();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gcpProject, setGcpProject] = useState('');
  const [gcpLocation, setGcpLocation] = useState('');
  const [gcpDataset, setGcpDataset] = useState('');
  const [gcpFhirStore, setGcpFhirStore] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!activeOrgId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/orgs/${activeOrgId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description, gcpProject, gcpLocation, gcpDataset, gcpFhirStore }),
      });
      if (response.ok) {
        await refreshProjects();
        navigate(`/orgs/${activeOrgSlug}/projects`);
      } else {
        const err = await response.json();
        setError(err.error ?? 'Failed to create project');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack w={500} gap="md" p="md">
      <Title order={2}>Create Project</Title>
      <TextInput label="Name" required value={name} onChange={(e) => setName(e.currentTarget.value)} />
      <Textarea label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
      <TextInput label="GCP Project" required value={gcpProject} onChange={(e) => setGcpProject(e.currentTarget.value)} />
      <TextInput label="GCP Location" required value={gcpLocation} onChange={(e) => setGcpLocation(e.currentTarget.value)} placeholder="us-central1" />
      <TextInput label="GCP Dataset" required value={gcpDataset} onChange={(e) => setGcpDataset(e.currentTarget.value)} />
      <TextInput label="GCP FHIR Store" required value={gcpFhirStore} onChange={(e) => setGcpFhirStore(e.currentTarget.value)} />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Button onClick={handleSubmit} loading={loading} disabled={!name || !gcpProject || !gcpLocation || !gcpDataset || !gcpFhirStore}>
        Create Project
      </Button>
    </Stack>
  );
}
```

Note: Missing `Text` import — add to the Mantine import line.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProjectsPage.tsx src/pages/CreateProjectPage.tsx
git commit -m "feat: add ProjectsPage and CreateProjectPage"
```

---

## Task 18: Update Shell with Org/Project Switchers

**Files:**
- Modify: `src/Shell.tsx`

- [ ] **Step 1: Add OrgSwitcher and ProjectSwitcher to header**

Modify `src/Shell.tsx`:

1. Import `OrgSwitcher` and `ProjectSwitcher`
2. Replace the "Change Store" button in the header with the two switcher components
3. Update sidebar NavLink `to` props to use org/project slug prefixes from `useOrg()`
4. Replace `signOut` button with one that calls Better Auth's signOut

The header Group should become:

```tsx
<Group h="100%" px="md">
  <Anchor component={Link} to="/" underline="never" c="inherit">
    <Group gap={8} wrap="nowrap"><CinderLogo /><Title order={3}>Cinder</Title></Group>
  </Anchor>
  <OrgSwitcher />
  <ProjectSwitcher />
  <TextInput
    placeholder="Search..."
    leftSection={<IconSearch size={16} />}
    rightSection={<Kbd size="xs">⌘K</Kbd>}
    ml="xl"
    style={{ flex: 1, maxWidth: 400 }}
    onClick={() => spotlight.open()}
    readOnly
  />
  <Button variant="subtle" size="compact-sm" ml="auto" onClick={signOut}>Sign Out</Button>
</Group>
```

Update sidebar links to use the org/project prefix:

```tsx
const { activeOrgSlug, activeProject } = useOrg();
const basePath = activeOrgSlug && activeProject
  ? `/orgs/${activeOrgSlug}/projects/${activeProject.slug}`
  : '';

// Then in NavLinks:
<NavLink component={Link} to={`${basePath}/${type}`} ... />
```

- [ ] **Step 2: Remove `onChangeStore` prop**

The `ShellProps` interface and `onChangeStore` prop are no longer needed. Org/project switching is handled by the dropdown components.

- [ ] **Step 3: Commit**

```bash
git add src/Shell.tsx
git commit -m "feat: add org and project switchers to app shell header"
```

---

## Task 19: Update App.tsx Routes

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/AppProviders.tsx`

- [ ] **Step 1: Rewrite App.tsx with new route structure**

Replace the current route structure with org/project-scoped routes:

```typescript
// ABOUTME: Root application component with auth gating and route definitions.
// ABOUTME: Orchestrates sign-in, org selection, and the main FHIR browser.
import { Center, Loader } from '@mantine/core';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Route, Routes, Navigate } from 'react-router';
import { AppProviders, FhirProvider } from './AppProviders';
import { useAuth } from './auth/AuthProvider';
import { useOrg } from './contexts/OrgContext';
import { Shell } from './Shell';
import { HomePage } from './pages/HomePage';
import { ResourceTypePage } from './pages/ResourceTypePage';
import { ResourceDetailPage } from './pages/ResourceDetailPage';
import { ResourceCreateRoutePage } from './pages/ResourceCreateRoutePage';
import { BulkLoadPage } from './pages/BulkLoadPage';
import { DeletePatientResourcesPage } from './pages/DeletePatientResourcesPage';
import { SignInPage } from './pages/SignInPage';
import { CreateOrgPage } from './pages/CreateOrgPage';
import { OrgSettingsPage } from './pages/OrgSettingsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { loadSchemas } from './schemas';

function AppContent(): JSX.Element {
  const { isAuthenticated, session } = useAuth();
  const [schemasReady, setSchemasReady] = useState(false);

  useEffect(() => {
    loadSchemas().then(() => setSchemasReady(true));
  }, []);

  if (session.isPending) {
    return <Center h="100vh"><Loader size="lg" /></Center>;
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="*" element={<Navigate to="/sign-in" />} />
      </Routes>
    );
  }

  if (!schemasReady) {
    return <Center h="100vh"><Loader size="lg" /></Center>;
  }

  return (
    <Routes>
      <Route path="/orgs/new" element={<CreateOrgPage />} />
      <Route path="/orgs/:orgSlug/settings" element={<OrgSettingsPage />} />
      <Route path="/orgs/:orgSlug/projects" element={<ProjectsPage />} />
      <Route path="/orgs/:orgSlug/projects/new" element={<CreateProjectPage />} />
      <Route element={<FhirProvider><Shell /></FhirProvider>}>
        <Route path="/orgs/:orgSlug/projects/:projectSlug" element={<HomePage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/:resourceType" element={<ResourceTypePage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/:resourceType/new" element={<ResourceCreateRoutePage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/:resourceType/:id" element={<ResourceDetailPage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/:resourceType/:id/:tab" element={<ResourceDetailPage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/bulk-load" element={<BulkLoadPage />} />
        <Route path="/orgs/:orgSlug/projects/:projectSlug/delete-patient-resources" element={<DeletePatientResourcesPage />} />
      </Route>
      <Route path="/" element={<OrgRedirect />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function OrgRedirect(): JSX.Element {
  const { activeOrgSlug, activeProject } = useOrg();
  if (activeOrgSlug && activeProject) {
    return <Navigate to={`/orgs/${activeOrgSlug}/projects/${activeProject.slug}`} />;
  }
  if (activeOrgSlug) {
    return <Navigate to={`/orgs/${activeOrgSlug}/projects`} />;
  }
  return <Navigate to="/orgs/new" />;
}

export function App(): JSX.Element {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
```

- [ ] **Step 2: Update AppProviders.tsx**

Add `OrgProvider` to the provider stack:

```typescript
export function AppProviders({ children }: AppProvidersProps): JSX.Element {
  return (
    <MantineProvider>
      <AuthProvider>
        <BrowserRouter>
          <OrgProvider>
            {children}
          </OrgProvider>
        </BrowserRouter>
      </AuthProvider>
    </MantineProvider>
  );
}
```

Update the `FhirProvider` as described in Task 14.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/AppProviders.tsx
git commit -m "feat: update routes for org/project structure and add OrgProvider"
```

---

## Task 20: Update SignInPage

**Files:**
- Modify: `src/pages/SignInPage.tsx`

- [ ] **Step 1: Update SignInPage to use Better Auth**

The existing page already calls `useAuth().signIn` — since we rewrote AuthProvider in Task 12, this should work with Better Auth's `signIn.social({ provider: 'google' })`. Verify the page renders and the button triggers the OAuth redirect.

The only change needed is adding a description that clarifies this is Google SSO (no GCP access needed):

```tsx
<Text size="sm" c="dimmed" maw={300} ta="center">
  Sign in with your Google account. No GCP access required — your organization provides FHIR store access.
</Text>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/SignInPage.tsx
git commit -m "feat: update SignInPage for Better Auth Google OAuth flow"
```

---

## Task 21: Update Environment and Docs

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md` (update auth references)

- [ ] **Step 1: Update .env.example with all new vars**

```bash
# GCP Healthcare API coordinates (for dev proxy mode only)
VITE_GCP_PROJECT=your-gcp-project
VITE_GCP_LOCATION=us-central1
VITE_GCP_DATASET=your-dataset
VITE_GCP_FHIR_STORE=your-fhir-store

# DEPRECATED: replaced by GOOGLE_CLIENT_ID (server-side)
# VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# Database (required)
DATABASE_URL=postgresql://cinder:cinder@localhost:5432/cinder

# Auth (Better Auth)
BETTER_AUTH_SECRET=<random-secret-for-sessions>
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>

# Encryption (for service account storage)
CINDER_ENCRYPTION_KEY=<32-byte-base64-master-key>
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with Better Auth and encryption env vars"
```

---

## Task 22: Integration Testing

**Files:**
- Existing test files to update

- [ ] **Step 1: Run all existing tests**

```bash
bun run test
```

Identify which tests break due to the auth changes. Common failures:
- `AuthProvider.test.tsx` — uses the old Google OAuth mock
- `AppProviders` tests — if any exist
- Tests that mock `getAccessToken()` on the MedplumClient

- [ ] **Step 2: Update AuthProvider.test.tsx**

Rewrite to test Better Auth session behavior instead of Google OAuth token flow. Mock the Better Auth client's `useSession` hook.

- [ ] **Step 3: Update any MedplumClient test mocks**

Tests that previously mocked `Authorization: Bearer` headers should now mock session cookies and `X-Project-Id` headers.

- [ ] **Step 4: Run tests again and fix remaining failures**

```bash
bun run test
```

Expected: All tests PASS.

- [ ] **Step 5: Run build**

```bash
bun run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: update tests for Better Auth and org-based FHIR access"
```

---

## Task 23: Manual End-to-End Verification

This task requires a running Postgres database and configured environment variables.

- [ ] **Step 1: Start the server**

```bash
bun run start
```

Expected: Server starts, creates all tables.

- [ ] **Step 2: Verify auth flow**

1. Navigate to `http://localhost:3000`
2. Should redirect to `/sign-in`
3. Click "Sign in with Google"
4. Complete OAuth flow
5. Should redirect to `/orgs/new` (first time user)

- [ ] **Step 3: Create an org**

1. Enter org name and slug
2. Submit
3. Should redirect to org settings page

- [ ] **Step 4: Upload service account**

1. Go to Credentials tab
2. Upload a valid service account JSON file
3. Should show "configured" status

- [ ] **Step 5: Create a project**

1. Navigate to Projects
2. Create a project with GCP coordinates
3. Should appear in project list

- [ ] **Step 6: Browse FHIR data**

1. Select the project
2. Navigate to a resource type (e.g., Patient)
3. Should see FHIR resources from the configured store

- [ ] **Step 7: Add a member**

1. Go to org settings → Members tab
2. Add a team member's email
3. Sign in as that user and verify they can see the org and browse FHIR data

- [ ] **Step 8: Commit any fixes from E2E testing**

```bash
git add -A
git commit -m "fix: address issues found during E2E verification"
```

---

## Review Errata — Fixes Applied After Plan Review

The following corrections must be applied during implementation. They address issues found during the plan review.

### E1: Fix `getMasterKey` version logic (affects Task 2)

The `getMasterKey` function has inverted version logic. The convention is:
- `CINDER_ENCRYPTION_KEY` = the **current** master key
- `CINDER_ENCRYPTION_KEY_V{N}` = **previous** versions (for decryption during rotation)

Fix: `keyVersion` in the DB tracks which version was used to encrypt. During normal operation (no rotation), `keyVersion=1` and `getMasterKey()` returns `CINDER_ENCRYPTION_KEY`. After rotation, old rows still have `keyVersion=1` and need `CINDER_ENCRYPTION_KEY_V1`. New rows get `keyVersion=2` and use `CINDER_ENCRYPTION_KEY`.

The `getMasterKey` function should be:

```typescript
export function getMasterKey(version?: number): string {
  const currentVersion = Number(process.env.CINDER_ENCRYPTION_KEY_VERSION ?? '1');
  const effectiveVersion = version ?? currentVersion;

  if (effectiveVersion === currentVersion) {
    const key = process.env.CINDER_ENCRYPTION_KEY;
    if (!key) throw new Error('CINDER_ENCRYPTION_KEY environment variable is required');
    return key;
  }

  const key = process.env[`CINDER_ENCRYPTION_KEY_V${effectiveVersion}`];
  if (!key) throw new Error(`CINDER_ENCRYPTION_KEY_V${effectiveVersion} required for key version ${effectiveVersion}`);
  return key;
}
```

Add `CINDER_ENCRYPTION_KEY_VERSION=1` to `.env.example`.

### E2: Add `db:rotate-keys` CLI command (new Task 2b)

Create `server/rotate-keys.ts`:

```typescript
// ABOUTME: CLI script to rotate the master encryption key for org credentials.
// ABOUTME: Re-encrypts all DEKs with the new master key and updates key_version.
import { db } from './db';
import { orgCredential } from './schema';
import { decryptCredential, encryptCredential, getMasterKey } from './crypto';

async function rotateKeys() {
  const currentVersion = Number(process.env.CINDER_ENCRYPTION_KEY_VERSION ?? '1');
  const newMasterKey = getMasterKey(currentVersion); // current key is the new one

  const rows = await db.select().from(orgCredential);
  console.log(`Rotating ${rows.length} credential(s)...`);

  for (const row of rows) {
    const oldMasterKey = getMasterKey(row.keyVersion);
    const plaintext = decryptCredential(row, oldMasterKey);
    const reEncrypted = encryptCredential(plaintext, newMasterKey);

    await db.update(orgCredential)
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
}

rotateKeys().catch(console.error);
```

Add to `package.json` scripts: `"db:rotate-keys": "bun server/rotate-keys.ts"`

### E3: Fix direct-add member flow (affects Task 9)

The `handleDirectAddMember` function should NOT pass email as `userId`. Fix:

```typescript
export async function handleDirectAddMember(req: Request, orgId: string): Promise<Response> {
  // ... (validation unchanged) ...

  // First, try to find existing user by email
  // If found, add them directly. If not, create an invitation.
  try {
    const result = await auth.api.createInvitation({
      body: {
        organizationId: orgId,
        email: input.email,
        role: input.role,
      },
      headers: req.headers,
    });
    return Response.json(result, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message ?? 'Failed to add member' }, { status: 400 });
  }
}
```

Always use `createInvitation` for now. Better Auth's invitation flow handles the user lookup and linking on sign-in. The "stub user" approach from the spec needs more investigation into Better Auth's internals — defer until we can test it.

### E4: Add member removal endpoint (affects Task 9)

Add to `server/routes/members.ts`:

```typescript
export async function handleRemoveMember(req: Request, orgId: string, userId: string): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  try {
    await auth.api.removeMember({
      body: { organizationId: orgId, memberIdOrUserId: userId },
      headers: req.headers,
    });
    return new Response(null, { status: 204 });
  } catch (e: any) {
    return Response.json({ error: e.message ?? 'Failed to remove member' }, { status: 400 });
  }
}
```

Route in server.ts: `DELETE /api/orgs/:id/members/:uid`

Wire up the trash icon onClick in OrgSettingsPage's MembersTab.

### E5: Add org deletion handler with cache cleanup (affects Task 10)

Add to server.ts route handling:

```typescript
if (url.pathname.match(/^\/api\/orgs\/[\w-]+$/) && req.method === 'DELETE') {
  const orgId = url.pathname.split('/')[3]!;
  // Evict cached token before delegating to Better Auth
  tokenCache.evict(orgId);
  // Better Auth handles org deletion (cascades members, invitations)
  // FK cascades handle org_credential and project cleanup
  const result = await auth.api.deleteOrganization({
    body: { organizationId: orgId },
    headers: req.headers,
  });
  return withSecurityHeaders(Response.json(result));
}
```

### E6: Add FK constraints with CASCADE (affects Task 4)

In `ensureTables()`, add FK references after Better Auth creates its tables:

```sql
-- Add after Better Auth tables exist (run on startup, idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_credential_org_fk') THEN
    ALTER TABLE "org_credential" ADD CONSTRAINT "org_credential_org_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_org_fk') THEN
    ALTER TABLE "project" ADD CONSTRAINT "project_org_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
  END IF;
END $$;
```

This must run AFTER Better Auth creates the `organization` table. Add to `ensureTables()` at the end.

### E7: Sync OrgContext with Better Auth on mount (affects Task 13)

Add an effect in OrgProvider that calls `setActive` when loading from localStorage:

```typescript
// After the activeOrgId state initialization
useEffect(() => {
  if (activeOrgId) {
    authClient.organization.setActive({ organizationId: activeOrgId });
  }
}, []); // Run once on mount
```

### E8: Add FHIR proxy integration tests (affects Task 22)

Add tests to `server.test.ts` covering:
- Missing session → 401
- Missing X-Project-Id → 400
- Project not found → 404
- Non-member of org → 403
- No credential configured → 503
- GCP token minting failure → 502
- Successful proxy (mock upstream)

### E9: Dev proxy mode compatibility (affects Tasks 12, 19)

The plan removes dev proxy mode support. This is intentional — Better Auth requires setup even for local dev. Document the local dev setup:

1. Start Postgres (`docker compose up -d` or local install)
2. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `.env`
3. Run `bun run dev` (Vite) + `bun run start` (Bun server) concurrently
4. Dev proxy mode with `service-account.json` is deprecated

If a zero-auth dev mode is needed later, it can be re-added as a separate concern.

### E10: Org CRUD endpoints come from Better Auth (clarification for Task 10)

Better Auth's organization plugin exposes these at `/api/auth/*`:
- Create org, list orgs, get org, update org, delete org
- List members, invite, remove member

The custom `/api/orgs/*` routes in the plan are ONLY for: credentials (custom table), projects (custom table), and direct-add members (custom logic wrapping Better Auth's invitation API).

Verify during implementation which Better Auth endpoints map to `POST /api/auth/organization/create`, `GET /api/auth/organization/list-organizations`, etc. The frontend should use `authClient.organization.*` methods for standard org operations, not custom fetch calls.

### E11: Fix missing `Text` imports (affects Tasks 16, 17)

In `CreateOrgPage.tsx`: change import to `import { Button, Center, Stack, Text, TextInput, Title } from '@mantine/core';`

In `CreateProjectPage.tsx`: change import to `import { Button, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';`

### E12: Prevent project existence leak (affects Task 8)

In `handleGetProject`, return generic 404 for both "not found" and "not a member":

```typescript
export async function handleGetProject(req: Request, projectId: string): Promise<Response> {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const [row] = await db.select().from(project).where(eq(project.id, projectId)).limit(1);
  if (!row) return Response.json({ error: 'Project not found' }, { status: 404 });

  // Check membership — return same 404 if not a member (don't leak existence)
  try {
    await requireOrgMember(req, row.organizationId);
  } catch {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  return Response.json(row);
}
```

Apply the same pattern to `handleUpdateProject` and `handleDeleteProject`.

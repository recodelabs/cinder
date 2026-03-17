# Multi-Tenant Organization Support with Service Account Auth

> **Date:** 2026-03-17
> **Status:** Draft
> **Supersedes:** docs/plans/2026-02-13-fhir-store-management.md (partially — replaces auth model)

---

## Problem Statement

Cinder currently requires each user to have direct GCP IAM access to the Healthcare API. There is no concept of organizations, shared credentials, or team access. Users manually enter FHIR store coordinates every session.

## Goal

Build multi-tenant organization support where:

1. An **org owner** creates an organization and uploads a **Google service account** key
2. The owner adds **team members** by email (direct add or invitation)
3. Members sign in via **Google OAuth** (identity verification only — no GCP IAM needed)
4. All FHIR API access uses the **org's service account**, not personal tokens
5. Each org can have multiple **projects** pointing to different FHIR stores

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Browser (SPA)                                   │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Better Auth  │  │ Project Picker          │  │
│  │ (Google SSO) │  │ (org → project)         │  │
│  └──────┬──────┘  └──────────┬──────────────┘  │
│         │                    │                  │
│  ┌──────▼────────────────────▼───────────────┐  │
│  │ HealthcareMedplumClient                   │  │
│  │ Cookie auth + X-Project-Id header         │  │
│  └──────────────────┬────────────────────────┘  │
└─────────────────────┼───────────────────────────┘
                      │
              ┌───────▼─────────────────────┐
              │ Bun server.ts               │
              │  /api/auth/* → Better Auth   │
              │  /api/orgs/* → Org CRUD      │
              │  /api/projects/* → Projects   │
              │  /fhir/* → Proxy (uses org's │
              │   service account token)     │
              └───┬──────────┬──────────────┘
                  │          │
          ┌───────▼──┐  ┌───▼──────────┐
          │ Postgres │  │ GCP Healthcare│
          │ (Drizzle)│  │ FHIR API      │
          └──────────┘  └──────────────┘
```

The FHIR proxy authenticates to GCP using the org's service account, not the user's personal Google token. Users only need Google OAuth to prove their identity.

---

## Tech Stack Additions

| Component | Library | Purpose |
|-----------|---------|---------|
| Auth | `better-auth` | Server-side auth with organization plugin |
| Auth Client | `@better-auth/client` | React auth hooks and session management |
| ORM | `drizzle-orm` + `drizzle-kit` | Type-safe Postgres schema & migrations |
| DB Driver | `postgres` (porsager/postgres) | Postgres client for Bun |
| Validation | `zod` | API input validation |

---

## Data Model

### Better Auth Managed Tables (auto-created)

**Core auth:**
- `user` — id, name, email, emailVerified, image, timestamps
- `session` — id, userId, token, expiresAt, ipAddress, userAgent, timestamps
- `account` — id, userId, accountId, providerId ("google"), tokens, timestamps
- `verification` — id, identifier, value, expiresAt, timestamps

**Organization plugin:**
- `organization` — id, name, slug, logo, metadata, timestamps
- `member` — id, userId, organizationId, role ("owner" | "member"), timestamps
- `invitation` — id, email, organizationId, role, inviterId, status, expiresAt, timestamps

### Custom Tables (Drizzle-managed)

```sql
org_credential
├── id (text, PK)
├── organization_id (text, FK → organization.id, unique, ON DELETE CASCADE)
├── encrypted_service_account (text, not null)  -- AES-256-GCM encrypted JSON
├── encrypted_dek (text, not null)              -- DEK wrapped by master key
├── iv (text, not null)                         -- IV for credential encryption
├── auth_tag (text, not null)                   -- GCM auth tag for credentials
├── dek_iv (text, not null)                     -- IV for DEK encryption
├── dek_auth_tag (text, not null)               -- GCM auth tag for DEK
├── key_version (integer, not null, default 1)  -- master key version for rotation
├── created_at (timestamp, default now())
└── updated_at (timestamp, default now())

project
├── id (text, PK)
├── name (text, not null)
├── slug (text, not null)
├── description (text, nullable)
├── organization_id (text, FK → organization.id, ON DELETE CASCADE, not null)
├── gcp_project (text, not null)
├── gcp_location (text, not null)
├── gcp_dataset (text, not null)
├── gcp_fhir_store (text, not null)
├── created_at (timestamp, default now())
├── updated_at (timestamp, default now())
└── UNIQUE(organization_id, slug)
```

**Design notes:**
- One `org_credential` per org (1:1). Credentials are isolated from the org table so they're never accidentally selected/joined.
- `project` maps to a specific FHIR store. One org can have multiple projects, all sharing the same service account.
- The existing `saved_store` table is deprecated and replaced by `project`.

---

## Envelope Encryption for Service Account Keys

```
ENV: CINDER_ENCRYPTION_KEY=<32-byte base64-encoded master key>

Per org:
  1. Generate random 256-bit DEK (data encryption key)
  2. Encrypt service account JSON with DEK using AES-256-GCM
  3. Encrypt DEK with master key using AES-256-GCM
  4. Store in DB: encrypted_service_account, encrypted_dek, iv, auth_tag, dek_iv, dek_auth_tag

Decryption (at FHIR proxy time):
  1. Decrypt DEK using master key + dek_iv + dek_auth_tag
  2. Decrypt service account JSON using DEK + iv + auth_tag
  3. Use decrypted JSON to mint GCP access token
  4. Discard decrypted JSON; cache the access token (~55 min TTL)
```

**Key rotation:**
- Each `org_credential` row has a `key_version` column identifying which master key encrypted its DEK
- `CINDER_ENCRYPTION_KEY` is the current key; `CINDER_ENCRYPTION_KEY_V{N}` env vars hold previous versions
- Rotation procedure: set new `CINDER_ENCRYPTION_KEY`, keep old key as `CINDER_ENCRYPTION_KEY_V1`
- Run `bun run db:rotate-keys` CLI command which re-encrypts all DEKs with the new master key and updates `key_version`
- During rotation, decryption falls back to the key version stored in the row
- The service account JSON itself doesn't change — only the DEK wrapping changes

**Security properties:**
- DB leak alone doesn't expose credentials (need master key)
- AES-256-GCM provides authenticated encryption (tamper detection)
- Decrypted key material lives in memory only during token minting
- Cached GCP access tokens (not keys) are held in memory

---

## Auth Flow

### Sign In
1. User clicks "Sign in with Google"
2. Better Auth handles OAuth server-side (authorization code flow)
3. Better Auth creates/updates user, account, and session records
4. Browser receives httpOnly session cookie

### FHIR Request Flow
1. Browser sends request to `/fhir/*` with session cookie + `X-Project-Id` header
2. Server validates session via Better Auth
3. Server looks up project → gets organizationId
4. Server verifies user is a member of that org
5. Server decrypts org's service account credentials
6. Server mints/caches GCP access token from service account
7. Server proxies request to GCP Healthcare API with access token

### Service Account Token Caching
- Service account JWT is signed → exchanged for GCP access token
- Access token cached in memory, keyed by org ID
- ~55 min TTL (GCP tokens expire at 60 min)
- Avoids re-signing JWT on every request
- **Cache invalidation:** When credentials are replaced via `PUT /api/orgs/:id/credential`, the cached token for that org is evicted immediately so new requests use the updated service account

### Member Management
Two ways to add members:
1. **Direct add** — Owner enters an email. Server creates a member record linked to the email. If no user record exists yet, it is created as a stub (emailVerified=false). When the person signs in with Google OAuth, Better Auth matches by email and the stub user is linked to their Google account. This flow must be tested to ensure Better Auth's social sign-in deduplicates by email correctly.
2. **Invite** — Better Auth invitation flow. User accepts on next sign-in.

---

## Roles & Permissions

| Action | Owner | Member |
|--------|-------|--------|
| Create/delete org | Yes | No |
| Upload/replace service account | Yes | No |
| Add/remove members | Yes | No |
| Create/edit/delete projects | Yes | No |
| Browse FHIR resources | Yes | Yes |
| Create/update/delete FHIR resources | Yes | Yes |

Admin role deferred — can be added later between owner and member.

---

## API Endpoints

### Auth (Better Auth built-in)
```
POST /api/auth/sign-in/social     — Google OAuth sign-in
POST /api/auth/sign-out           — Sign out
GET  /api/auth/session            — Get current session
```

### Organizations
```
POST   /api/orgs                  — Create org (any authenticated user)
GET    /api/orgs                  — List user's orgs
GET    /api/orgs/:id              — Get org details
PATCH  /api/orgs/:id              — Update org (owner)
DELETE /api/orgs/:id              — Delete org (owner)
```

### Members
```
GET    /api/orgs/:id/members      — List members (any member)
POST   /api/orgs/:id/members      — Direct add by email (owner)
DELETE /api/orgs/:id/members/:uid — Remove member (owner)
```

### Credentials
```
PUT    /api/orgs/:id/credential   — Upload/replace service account JSON (owner, max 10KB, validated)
GET    /api/orgs/:id/credential   — Check credential status (owner, metadata only — never returns the key)
```

**Credential upload validation:** Before encrypting, the server validates:
- JSON is well-formed and under 10KB
- Has `type === "service_account"`
- Has required fields: `project_id`, `private_key_id`, `private_key`, `client_email`

### Projects
```
GET    /api/orgs/:id/projects     — List projects (any member)
POST   /api/orgs/:id/projects     — Create project (owner)
GET    /api/projects/:id          — Get project details (member of its org)
PATCH  /api/projects/:id          — Update project (owner)
DELETE /api/projects/:id          — Delete project (owner)
```

### FHIR Proxy
```
ALL    /fhir/*                    — Proxy to GCP (any member, requires X-Project-Id header)
```

Most org/member/invitation endpoints come from Better Auth's organization plugin. Custom work is credentials, projects, and the updated FHIR proxy.

---

## Frontend

### Routes

Routes use **slugs** for human-readable, bookmarkable URLs. Server resolves slugs to IDs internally.

```
/sign-in                                              — Google OAuth sign-in
/orgs/new                                             — Create organization
/orgs/:orgSlug/settings                               — Org settings (service account, members)
/orgs/:orgSlug/projects                               — List projects
/orgs/:orgSlug/projects/new                           — Create project
/orgs/:orgSlug/projects/:projectSlug                  — FHIR browser home
/orgs/:orgSlug/projects/:projectSlug/:type            — Resource type list
/orgs/:orgSlug/projects/:projectSlug/:type/:id        — Resource detail
/orgs/:orgSlug/projects/:projectSlug/:type/new        — Create resource
```

Note: The FHIR proxy still uses `X-Project-Id` (UUID) in the header, not slugs. The frontend resolves the slug to an ID from the project list and sends the ID.

### Shell Changes
- Header: **org switcher** (dropdown, top-left) + **project switcher** (adjacent)
- Sidebar: resource type list, scoped to active project
- Org settings accessible from org switcher dropdown

### New Pages
| Page | Purpose |
|------|---------|
| `SignInPage` | "Sign in with Google" button |
| `CreateOrgPage` | Name + slug form |
| `OrgSettingsPage` | Two tabs: Members (list, direct add, remove) and Credentials (upload service account JSON, status indicator) |
| `ProjectsPage` | Card list of projects for the org |
| `CreateProjectPage` | Form: name, GCP project, location, dataset, FHIR store |

### Removed
- `StoreSelector` — replaced by org/project picker
- Google OAuth implicit flow — replaced by Better Auth

### User Journey
1. Sign in with Google
2. First time → "Create Organization" prompt
3. Upload service account JSON in org settings
4. Create a project (FHIR store coordinates)
5. Add team members by email
6. Everyone browses FHIR data

---

## Org Deletion

When an owner deletes an org:
1. `org_credential` and `project` rows cascade-deleted via FK constraints
2. In-memory token cache entry for the org is evicted
3. Better Auth handles cleanup of `member` and `invitation` rows
4. Active sessions of members browsing that org's projects will get a 404 on next FHIR request (org no longer exists)

Org deletion is handled through a custom endpoint that performs cleanup before delegating to Better Auth's org delete, ensuring the token cache is invalidated.

---

## FHIR Proxy Error Handling

When the proxy fails to authenticate to GCP:
- **No credential configured:** Return `503 Service Unavailable` with message "Organization has no service account configured"
- **Decryption failure:** Return `500 Internal Server Error`, log the error server-side
- **GCP token minting failure** (expired/revoked key): Return `502 Bad Gateway` with message "Failed to authenticate to GCP — service account may be invalid or revoked". Evict the cached token so next request retries.
- **GCP API error** (403, 404, etc.): Forward the upstream status code and error body to the client

---

## Security

- **Envelope encryption** for service account keys (AES-256-GCM, master key in env)
- **Credential endpoint** never returns the key — metadata only
- **Decrypted keys** held in memory only during token minting, then discarded
- **Session cookies** are httpOnly, secure, sameSite=lax
- **Org membership** verified on every FHIR proxy request
- **Owner-only operations** enforced server-side
- **Credential upload** validated and size-limited (10KB max)

## Explicitly Deferred
- Audit logging
- Admin role (between owner and member)
- Per-project permissions
- Service account key rotation UI
- Rate limiting
- Email notifications for invitations

---

## Migration Strategy

1. Better Auth creates its tables on first run (user, session, account, organization, member, invitation, verification)
2. Drizzle migrations create custom tables (org_credential, project)
3. Existing `saved_store` table is deprecated — not deleted, just unused. The `/api/stores` routes in server.ts are removed.
4. Dev proxy mode (service-account.json on disk) continues to work for local development
5. No data migration needed — sessionStorage configs are ephemeral

## Environment Variables

```
# Existing
DATABASE_URL=postgresql://user:password@localhost:5432/cinder

# New
BETTER_AUTH_SECRET=<random-secret-for-sessions>
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<oauth-client-id>              # replaces VITE_GOOGLE_CLIENT_ID (now server-side only)
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
CINDER_ENCRYPTION_KEY=<32-byte-base64-master-key>
```

Note: `VITE_GOOGLE_CLIENT_ID` (the old client-side env var) is no longer used. Auth is now entirely server-side.

### Known Limitations

- **Single-instance token cache:** In multi-instance deployments, credential replacement on one instance won't invalidate the cache on others. Each instance mints tokens independently. Acceptable for single-instance deployments (Railway); document as a limitation for scaling.
- **No CORS needed:** SPA and API are same-origin. No cross-origin API access planned.

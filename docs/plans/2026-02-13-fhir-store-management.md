# FHIR Store Management — Organization & Project Architecture Plan

> **Issue:** REC-35 — Store FHIR Stores
> **Date:** 2026-02-13
> **Status:** Approved

---

## Problem Statement

Currently, Cinder requires users to manually enter GCP project ID, location, dataset, and FHIR store name every session. This configuration is stored in browser `sessionStorage` and lost when the session ends. There is no concept of shared configuration, organizational access control, or project management.

## Goal

Build a multi-tenant organization and project management system backed by Postgres that:
1. **Persists FHIR store configurations** as "projects" in a database
2. **Supports organizations** — each org has members with roles and owns projects
3. **Is multi-tenant** — multiple organizations can coexist, each isolated from the others
4. **Integrates with Better Auth** — replacing the current Google OAuth2 implicit flow with a proper server-side auth system that supports sessions, organizations, and role-based access

---

## Current Architecture (Before)

```
┌─────────────────────────────────────────────┐
│ Browser (SPA)                               │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Google OAuth │  │ StoreConfig          │  │
│  │ (implicit)   │  │ (sessionStorage)     │  │
│  └──────┬──────┘  └──────────┬───────────┘  │
│         │                    │              │
│  ┌──────▼────────────────────▼───────────┐  │
│  │ HealthcareMedplumClient               │  │
│  │ (proxied through /fhir/*)             │  │
│  └──────────────────┬────────────────────┘  │
└─────────────────────┼───────────────────────┘
                      │
              ┌───────▼────────┐
              │ Bun server.ts  │
              │ (static + FHIR │
              │  proxy only)   │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │ GCP Healthcare │
              │ FHIR API       │
              └────────────────┘
```

**Key files involved:**
- `src/config/StoreConfig.ts` — StoreConfig interface + sessionStorage persistence
- `src/config/StoreSelector.tsx` — Manual form for entering GCP coordinates
- `src/auth/AuthProvider.tsx` — Google OAuth2 implicit flow (GIS)
- `src/auth/google-auth.ts` — TokenStore for access tokens
- `src/AppProviders.tsx` — Wires auth + FHIR client + Medplum provider
- `src/App.tsx` — Auth gating + store selection flow
- `server.ts` — Bun production server (static files + FHIR proxy)

---

## Proposed Architecture (After)

```
┌─────────────────────────────────────────────────┐
│ Browser (SPA)                                   │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Better Auth  │  │ Project Picker          │  │
│  │ Client       │  │ (fetched from API)      │  │
│  └──────┬──────┘  └──────────┬──────────────┘  │
│         │                    │                  │
│  ┌──────▼────────────────────▼───────────────┐  │
│  │ HealthcareMedplumClient                   │  │
│  │ (proxied through /fhir/*)                 │  │
│  └──────────────────┬────────────────────────┘  │
└─────────────────────┼───────────────────────────┘
                      │
              ┌───────▼─────────────────────┐
              │ Bun server.ts (extended)     │
              │  /api/auth/* → Better Auth   │
              │  /api/projects/* → CRUD      │
              │  /fhir/* → FHIR proxy        │
              │  /* → static SPA             │
              └───┬──────────┬──────────────┘
                  │          │
          ┌───────▼──┐  ┌───▼──────────┐
          │ Postgres │  │ GCP          │
          │ (Drizzle)│  │ Healthcare   │
          │          │  │ FHIR API     │
          └──────────┘  └──────────────┘
```

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

### Better Auth Managed Tables (auto-created by better-auth)

These tables are managed by the better-auth library and its organization plugin:

```
user
├── id (text, PK)
├── name (text)
├── email (text, unique)
├── emailVerified (boolean)
├── image (text, nullable)
├── createdAt (timestamp)
└── updatedAt (timestamp)

session
├── id (text, PK)
├── userId (text, FK → user.id)
├── token (text, unique) — session token
├── expiresAt (timestamp)
├── ipAddress (text, nullable)
├── userAgent (text, nullable)
├── createdAt (timestamp)
└── updatedAt (timestamp)

account
├── id (text, PK)
├── userId (text, FK → user.id)
├── accountId (text) — provider-specific ID
├── providerId (text) — e.g., "google", "credential"
├── accessToken (text, nullable)
├── refreshToken (text, nullable)
├── accessTokenExpiresAt (timestamp, nullable)
├── refreshTokenExpiresAt (timestamp, nullable)
├── scope (text, nullable)
├── idToken (text, nullable)
├── password (text, nullable) — for credential auth
├── createdAt (timestamp)
└── updatedAt (timestamp)

verification
├── id (text, PK)
├── identifier (text) — email or phone
├── value (text) — verification code/token
├── expiresAt (timestamp)
├── createdAt (timestamp)
└── updatedAt (timestamp)
```

### Better Auth Organization Plugin Tables (auto-created)

```
organization
├── id (text, PK)
├── name (text)
├── slug (text, unique)
├── logo (text, nullable)
├── metadata (text, nullable) — JSON
├── createdAt (timestamp)
└── updatedAt (timestamp)

member
├── id (text, PK)
├── userId (text, FK → user.id)
├── organizationId (text, FK → organization.id)
├── role (text) — "owner" | "admin" | "member"
├── createdAt (timestamp)
└── updatedAt (timestamp)

invitation
├── id (text, PK)
├── email (text)
├── organizationId (text, FK → organization.id)
├── role (text)
├── inviterId (text, FK → user.id)
├── status (text) — "pending" | "accepted" | "rejected" | "canceled"
├── expiresAt (timestamp)
├── createdAt (timestamp)
└── updatedAt (timestamp)
```

### Custom Application Tables (managed by Drizzle)

```
project
├── id (text, PK, cuid2)
├── name (text, not null)
├── slug (text, not null)
├── description (text, nullable)
├── organizationId (text, FK → organization.id, not null)
├── fhirStoreType (text, not null, default: 'gcp')
├── gcpProject (text, not null)
├── gcpLocation (text, not null)
├── gcpDataset (text, not null)
├── gcpFhirStore (text, not null)
├── createdAt (timestamp, default: now())
├── updatedAt (timestamp, default: now())
└── UNIQUE(organizationId, slug)
```

---

## Implementation Plan

### Phase 1: Database & Auth Foundation

#### Task 1: Add Dependencies
**New packages:**
```bash
bun add better-auth drizzle-orm postgres zod
bun add -d drizzle-kit @types/pg
```

**Files created:**
- None (package.json updated)

#### Task 2: Database Schema with Drizzle
**Files:**
- Create: `src/server/db/schema.ts` — Drizzle schema for `project` table
- Create: `src/server/db/index.ts` — Database connection (postgres client + drizzle instance)
- Create: `drizzle.config.ts` — Drizzle Kit configuration for migrations

The `project` table is the only custom table. All auth/org tables are managed by better-auth.

```typescript
// src/server/db/schema.ts
import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const project = pgTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  organizationId: text('organization_id').notNull(),
  fhirStoreType: text('fhir_store_type').notNull().default('gcp'),
  gcpProject: text('gcp_project').notNull(),
  gcpLocation: text('gcp_location').notNull(),
  gcpDataset: text('gcp_dataset').notNull(),
  gcpFhirStore: text('gcp_fhir_store').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgSlugUnique: unique().on(table.organizationId, table.slug),
}));
```

#### Task 3: Better Auth Server Configuration
**Files:**
- Create: `src/server/auth.ts` — Better Auth server instance with organization plugin
- Update: `.env.example` — Add DATABASE_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

Better Auth configuration:
```typescript
// src/server/auth.ts
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Request cloud-platform scope for FHIR API access
      scope: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/cloud-platform'],
    },
  },
  plugins: [
    organization({
      // Allow users to create organizations
      allowUserToCreateOrganization: true,
    }),
  ],
});
```

**Key decision — GCP access tokens:**
The user still needs a GCP access token to query the Healthcare FHIR API. Better Auth's Google social provider stores the `accessToken` in the `account` table. We can retrieve it from there when proxying FHIR requests. This means:
- The user signs in via Google OAuth (now server-side, not implicit)
- Better Auth stores the Google access token
- The FHIR proxy reads the token from the user's account record
- No more passing tokens from the browser

#### Task 4: Extend server.ts with API Routes
**Files:**
- Modify: `server.ts` — Add `/api/auth/*` and `/api/projects/*` routes

The existing Bun server currently handles:
- `/fhir/*` → FHIR proxy
- `/*` → Static SPA files

We extend it with:
- `/api/auth/*` → Better Auth handler
- `/api/projects` → Project CRUD (GET list, POST create)
- `/api/projects/:id` → Project CRUD (GET, PUT, DELETE)

The FHIR proxy is updated to:
1. Read the session from the request (via better-auth)
2. Look up the user's Google access token from the `account` table
3. Look up the project's FHIR store config from the `project` table
4. Proxy the request with the stored GCP token (no more X-Store-Base header from browser)

New FHIR proxy flow:
```
Browser: GET /fhir/Patient/123
  Headers: Cookie (session), X-Project-Id: <project-id>

Server:
  1. Validate session (better-auth)
  2. Look up project by ID, verify user's org membership
  3. Look up user's Google access token from account table
  4. Construct GCP Healthcare API URL from project config
  5. Proxy request with stored access token
```

#### Task 5: Project API Endpoints
**Files:**
- Create: `src/server/routes/projects.ts` — Project CRUD handlers

Endpoints:
- `GET /api/projects` — List projects for the user's active organization
- `POST /api/projects` — Create a project (admin/owner only)
- `GET /api/projects/:id` — Get project details
- `PUT /api/projects/:id` — Update project (admin/owner only)
- `DELETE /api/projects/:id` — Delete project (owner only)

All endpoints verify:
1. User is authenticated (via better-auth session)
2. User is a member of the organization that owns the project
3. User has the required role for write operations

### Phase 2: Frontend Integration

#### Task 6: Better Auth Client Setup
**Files:**
- Create: `src/auth/auth-client.ts` — Better Auth client with organization plugin
- Modify: `src/auth/AuthProvider.tsx` — Replace Google OAuth implicit flow with better-auth
- Modify: `src/auth/google-auth.ts` — Remove (replaced by better-auth)

```typescript
// src/auth/auth-client.ts
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

export const {
  useSession,
  signIn,
  signOut,
  useActiveOrganization,
  useListOrganizations,
} = authClient;
```

The AuthProvider is simplified — it wraps better-auth's session management instead of managing tokens directly.

#### Task 7: Organization Management UI
**Files:**
- Create: `src/pages/OrganizationPage.tsx` — Org settings, member management
- Create: `src/pages/CreateOrganizationPage.tsx` — Create new org
- Create: `src/components/OrgSwitcher.tsx` — Switch between organizations

Features:
- Create organization (name, slug)
- View organization members
- Invite members by email
- Switch active organization
- Organization switcher in the sidebar/header

#### Task 8: Project Management UI
**Files:**
- Create: `src/pages/ProjectsPage.tsx` — List projects for current org
- Create: `src/pages/ProjectSettingsPage.tsx` — Edit project FHIR store config
- Create: `src/components/ProjectPicker.tsx` — Select active project

This replaces the current `StoreSelector` component. Instead of entering raw GCP coordinates, users:
1. Select an organization
2. Select a project (which has pre-configured FHIR store settings)
3. Browse the FHIR store

Admin/owners can create and edit projects with their FHIR store configurations.

#### Task 9: Update App Routing & Navigation
**Files:**
- Modify: `src/App.tsx` — Add org/project routes, update auth gating
- Modify: `src/Shell.tsx` — Add org switcher, project picker to sidebar/header
- Modify: `src/AppProviders.tsx` — Replace FhirProvider to use project-based config

New route structure:
```
/                           → Home (redirect to active project)
/sign-in                    → Sign in page (better-auth)
/orgs/new                   → Create organization
/orgs/:orgSlug              → Organization dashboard
/orgs/:orgSlug/settings     → Organization settings & members
/orgs/:orgSlug/projects     → List projects
/orgs/:orgSlug/projects/new → Create project
/orgs/:orgSlug/projects/:projectSlug           → Project home
/orgs/:orgSlug/projects/:projectSlug/settings  → Project settings
/orgs/:orgSlug/projects/:projectSlug/:resourceType       → FHIR browser
/orgs/:orgSlug/projects/:projectSlug/:resourceType/:id   → FHIR resource
/orgs/:orgSlug/projects/:projectSlug/:resourceType/new   → Create resource
```

#### Task 10: Update FHIR Client for Project-Based Access
**Files:**
- Modify: `src/fhir/medplum-adapter.ts` — Send X-Project-Id header instead of X-Store-Base
- Modify: `src/config/StoreConfig.ts` — Deprecate sessionStorage, use project from API
- Remove: `src/config/StoreSelector.tsx` — Replaced by ProjectPicker

The MedplumClient adapter now sends:
- Session cookie (for auth)
- `X-Project-Id` header (to identify which FHIR store to proxy to)
- No more `Authorization: Bearer <token>` from the browser (server handles this)

### Phase 3: Migration & Cleanup

#### Task 11: Database Migrations
**Files:**
- Create: `drizzle/` directory with migration files
- Update: `package.json` — Add migration scripts

Scripts:
```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

#### Task 12: Environment & Deployment Updates
**Files:**
- Modify: `Dockerfile` — Add DATABASE_URL, ensure Postgres connectivity
- Modify: `.env.example` — Document all new env vars
- Create: `docker-compose.yml` (optional) — Postgres + app for local dev

New environment variables:
```
DATABASE_URL=postgresql://user:password@localhost:5432/cinder
BETTER_AUTH_SECRET=<random-secret>
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
```

#### Task 13: Testing
**Files:**
- Create: `src/server/routes/projects.test.ts` — API endpoint tests
- Create: `src/server/auth.test.ts` — Auth integration tests
- Update: `src/auth/AuthProvider.test.tsx` — Update for better-auth
- Create: `src/components/OrgSwitcher.test.tsx`
- Create: `src/components/ProjectPicker.test.tsx`

---

## Key Architectural Decisions

### 1. Why Better Auth over current Google OAuth implicit flow?
- **Server-side sessions** — More secure than storing tokens in sessionStorage
- **Built-in organization plugin** — Handles org/member/invitation CRUD out of the box
- **Multi-provider support** — Can add email/password, GitHub, etc. later
- **Token management** — Stores and refreshes Google access tokens server-side
- **Role-based access** — Owner/admin/member roles on organizations

### 2. Why Drizzle over Prisma?
- **Bun-native** — Works seamlessly with Bun runtime
- **SQL-like API** — Closer to raw SQL, less abstraction overhead
- **Better Auth adapter** — Official Drizzle adapter for better-auth
- **Lightweight** — No binary engine, smaller bundle

### 3. Why extend server.ts instead of a separate backend?
- **Already exists** — The Bun server is already running in production
- **Same runtime** — Bun handles both static serving and API
- **Single deployment** — One container, simpler ops
- **Shared types** — TypeScript types shared between server and client

### 4. FHIR proxy auth flow change
- **Before:** Browser sends `Authorization: Bearer <google-token>` and `X-Store-Base` header
- **After:** Browser sends session cookie and `X-Project-Id` header; server resolves both the GCP token and FHIR store URL from the database
- **Benefit:** Tokens never exposed to browser JavaScript, FHIR store configs managed centrally

### 5. Multi-tenancy model
- **Tenant = Organization** — Each org is fully isolated
- **Users can belong to multiple orgs** — Switch via org switcher
- **Projects scoped to orgs** — Each project maps to one FHIR store
- **Role-based project access** — Inherited from org membership (owner > admin > member)

---

## Files Modified/Created Summary

### New Files (16)
| File | Purpose |
|------|---------|
| `src/server/db/index.ts` | Postgres connection + Drizzle instance |
| `src/server/db/schema.ts` | Project table schema |
| `src/server/auth.ts` | Better Auth server config |
| `src/server/routes/projects.ts` | Project CRUD API handlers |
| `src/auth/auth-client.ts` | Better Auth React client |
| `src/pages/OrganizationPage.tsx` | Org settings UI |
| `src/pages/CreateOrganizationPage.tsx` | Create org UI |
| `src/pages/ProjectsPage.tsx` | List projects UI |
| `src/pages/ProjectSettingsPage.tsx` | Edit project UI |
| `src/components/OrgSwitcher.tsx` | Org switcher dropdown |
| `src/components/ProjectPicker.tsx` | Project selection |
| `drizzle.config.ts` | Drizzle Kit config |
| `drizzle/` | Migration files |
| `docker-compose.yml` | Local dev Postgres |
| `src/server/routes/projects.test.ts` | API tests |
| `src/components/ProjectPicker.test.tsx` | Component tests |

### Modified Files (8)
| File | Change |
|------|--------|
| `server.ts` | Add `/api/auth/*`, `/api/projects/*` routes; update FHIR proxy |
| `src/auth/AuthProvider.tsx` | Replace Google OAuth with better-auth |
| `src/App.tsx` | Add org/project routes, update auth gating |
| `src/Shell.tsx` | Add org switcher, project picker |
| `src/AppProviders.tsx` | Update providers for better-auth |
| `src/fhir/medplum-adapter.ts` | Send X-Project-Id instead of X-Store-Base |
| `package.json` | Add new dependencies and db scripts |
| `.env.example` | Add new env vars |

### Removed/Deprecated Files (3)
| File | Reason |
|------|--------|
| `src/config/StoreSelector.tsx` | Replaced by ProjectPicker |
| `src/auth/google-auth.ts` | Replaced by better-auth (can keep as fallback initially) |
| `src/config/StoreConfig.ts` | sessionStorage persistence no longer needed (project from API) |

---

## Migration Strategy

1. **Phase 1 first** — Get database + auth working, keep existing frontend as fallback
2. **Feature flag** — `VITE_USE_BETTER_AUTH` env var to toggle between old/new auth during transition
3. **Backward compatible** — Keep the dev proxy mode working for local development
4. **No data migration** — sessionStorage configs are ephemeral; users will recreate them as projects

---

## Resolved Decisions

1. **GCP token refresh** — Use auto-refresh via Google refresh tokens. Users stay logged in; the server silently refreshes expired GCP access tokens.
2. **Project-level permissions** — Keep it simple. Permissions are inherited from org membership (owner/admin/member). No per-project role overrides.
3. **Audit logging** — Deferred. Not in scope for this implementation.
4. **Service account support** — Deferred. User OAuth tokens only for now.

---

## Estimated Scope

- **13 tasks** across 3 phases
- **16 new files**, **8 modified files**, **3 deprecated files**
- **New dependencies:** 4 runtime, 1 dev
- **Infrastructure:** Requires a Postgres database

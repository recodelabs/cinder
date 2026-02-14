# Cinder — FHIR Browser for Google Cloud Healthcare API

## What is this?

Cinder is a React SPA that browses, searches, and edits FHIR resources in Google Cloud Healthcare API. It reuses Medplum's open-source components for display/input and proxies all FHIR REST operations through a Bun server.

## Tech Stack

- **Runtime:** Bun
- **Framework:** React 19, Vite 7, TypeScript (strict mode)
- **UI:** Mantine 8, Tabler Icons
- **Routing:** React Router 7
- **FHIR:** @medplum/core, @medplum/react, @medplum/fhirtypes, @medplum/definitions (all 5.0.x)
- **Auth:** Google Identity Services (implicit OAuth2 flow) — migrating to Better Auth
- **Testing:** Vitest, Testing Library (React + DOM + user-event), jsdom
- **Production Server:** Bun HTTP server (`server.ts`) — static files + FHIR proxy

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Start Vite dev server (port 5173)
bun run build        # TypeScript check + Vite production build
bun run test         # Run all tests once
bun run test:watch   # Run tests in watch mode
bun run start        # Start production server (port 3000)
```

## Project Structure

```
src/
├── auth/               # Auth provider, token management (Google OAuth)
├── config/             # FHIR store config (StoreConfig type, StoreSelector UI)
├── fhir/               # MedplumClient adapter, reference cache, ValueSet expansion
├── pages/              # Route pages (Home, ResourceType, ResourceDetail, etc.)
├── App.tsx             # Root component with auth gating + routing
├── AppProviders.tsx    # Context providers (Mantine, Auth, Router, Medplum)
├── Shell.tsx           # App shell (header, sidebar, spotlight search)
├── constants.ts        # FHIR resource type list
├── schemas.ts          # Loads FHIR R4 StructureDefinitions at startup
└── errors.ts           # Safe error message extraction (strips GCP paths)

server.ts               # Bun production server (SPA + FHIR proxy)
docs/plans/             # Implementation plans
```

## Code Conventions

- Every file starts with two `// ABOUTME:` comment lines describing the file's purpose
- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`
- React components use named function exports (not default exports)
- Props interfaces use `readonly` modifier
- Test files are co-located: `Foo.tsx` → `Foo.test.tsx`
- Use Mantine components for all UI (no raw HTML elements for layout)
- FHIR operations go through the `HealthcareMedplumClient` adapter, never direct fetch

## Architecture

### FHIR Proxy

All FHIR requests go through `/fhir/*`:
- **Dev:** Vite proxy rewrites to GCP Healthcare API (uses `service-account.json` if present)
- **Prod:** `server.ts` proxies using `X-Store-Base` header from the browser

### Schema Loading

FHIR R4 schemas are loaded from `@medplum/definitions` bundles at startup (`loadSchemas()`). The MedplumClient's `requestSchema()` and `requestProfileSchema()` are no-ops since everything is pre-loaded.

### ValueSet Expansion (Two-Tier)

1. Local bundled ValueSets (administrative-gender, marital-status, etc.)
2. Fallback to `https://tx.fhir.org/r4/ValueSet/$expand` for clinical codes (SNOMED, LOINC)

### Auth Flow

Without `VITE_GOOGLE_CLIENT_ID`: dev proxy mode (no auth, uses service account)
With `VITE_GOOGLE_CLIENT_ID`: Google OAuth implicit flow → StoreSelector → FHIR browser

## Dev Setup

1. Copy `.env.example` to `.env` and fill in GCP coordinates
2. For dev proxy mode: place a GCP service account key at `service-account.json` (gitignored)
3. For browser OAuth: set `VITE_GOOGLE_CLIENT_ID` in `.env`
4. `bun install && bun run dev`

## Testing

- Tests use Vitest with jsdom environment
- FHIR schemas are loaded globally in `src/test.setup.ts`
- Wrap components in `<MantineProvider>` for rendering tests
- Use `vi.stubGlobal('fetch', mockFetch)` for API mocking
- Server tests (`server.test.ts`) are excluded from Vite test config (run separately)

## Key Patterns

- `StoreConfig` holds GCP coordinates (project, location, dataset, fhirStore)
- `storeBaseUrl(config)` builds the Healthcare API URL from a StoreConfig
- `safeErrorMessage(error)` strips GCP resource paths before showing to users
- `ReferenceCache` is an LRU cache (max 100) for resolved FHIR references
- Pagination uses `_cursor` param (rewritten to `_page_token` for GCP API)
- 401 responses trigger automatic sign-out

## Deployment

- Docker: multi-stage build, runs as non-root `cinder` user on port 3000
- Hosted on Railway
- `VITE_GOOGLE_CLIENT_ID` is a build arg for the Docker image

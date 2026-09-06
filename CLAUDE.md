# Cinder — FHIR Browser for Google Cloud Healthcare API

## What is this?

Cinder is a React SPA that browses, searches, and edits FHIR resources in Google Cloud Healthcare API. It reuses Medplum's open-source components for display/input and proxies all FHIR REST operations through a Bun server.

## Tech Stack

- **Runtime:** Bun
- **Framework:** React 19, Vite 7, TypeScript (strict mode)
- **UI:** Mantine 8, Tabler Icons
- **Routing:** React Router 7
- **FHIR:** @medplum/core, @medplum/react, @medplum/fhirtypes, @medplum/definitions (all 5.0.x)
- **Auth:** Better Auth (Google social login; optional email/password for local dev)
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
bun run dev:server   # Bun API server with reload (needed alongside `bun run dev`)
bun run db:up        # Local Postgres via docker compose
```

## Project Structure

```
src/
├── auth/               # Auth provider, token management (Google OAuth)
├── config/             # FHIR store config (StoreConfig type, StoreSelector UI)
├── fhir/               # MedplumClient adapter, reference cache, ValueSet expansion
├── pages/              # Route pages (Home, ResourceType, ResourceDetail, etc.)
├── pages/map/          # Locations Map (/map): MapLibre view of ICR Location geometry + Terra Draw editing
├── App.tsx             # Root component with auth gating + routing
├── AppProviders.tsx    # Context providers (Mantine, Auth, Router, Medplum)
├── Shell.tsx           # App shell (header, sidebar, spotlight search)
├── constants.ts        # FHIR resource type list
├── schemas.ts          # Loads FHIR R4 StructureDefinitions at startup
└── errors.ts           # Safe error message extraction (strips GCP paths)

server.ts               # Bun production server (SPA + FHIR proxy)
docs/plans/             # Implementation plans
```

### Locations Map

`/map` visualizes FHIR `Location` resources per the ICR IG data model: boundary polygons come
from the `location-boundary-geojson` extension (Attachment, `application/geo+json`, inline
base64 `data` or fetchable `url`), with `Location.position` as the point fallback. Filters:
ICR location type (`icr-location-type-cs`) and parent (`partof`). Terra Draw provides point/
polygon drawing; saves write `Location.position` (points) or the boundary extension (polygons).
Dev harness: `bun run dev` then open `/map-preview.html` — runs the map page against in-memory
fixture Locations, no auth or FHIR store needed (`src/map-preview.tsx`).

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

All FHIR requests go through `/fhir/*` on the Bun server (`server.ts`); in dev, Vite proxies
`/fhir` and `/api` to it on port 3000. The browser sends `X-Project-Id`; the server looks up the
project and forwards based on its `serverType`:
- **`gcp`:** Google Cloud Healthcare API, authenticated with the org's service account or the
  user's Google token. `_cursor` is rewritten to `_page_token`.
- **`fhir`:** any FHIR R4 server (e.g. local HAPI) at `fhirBaseUrl`, no auth. Helpers in
  `server/fhir-target.ts` translate HAPI `_getpages` paging into the same `_page_token`
  contract and rewrite Bundle links back to the proxy. Hosts must be listed in
  `CINDER_ALLOWED_FHIR_HOSTS`.

### Schema Loading

FHIR R4 schemas are loaded from `@medplum/definitions` bundles at startup (`loadSchemas()`). The MedplumClient's `requestSchema()` and `requestProfileSchema()` are no-ops since everything is pre-loaded.

### ValueSet Expansion (Two-Tier)

1. Local bundled ValueSets (administrative-gender, marital-status, etc.)
2. Fallback to `https://tx.fhir.org/r4/ValueSet/$expand` for clinical codes (SNOMED, LOINC)

### Auth Flow

Better Auth sessions (`server/auth.ts`) with Google sign-in, then org → project selection.
With `CINDER_DEV_AUTH=true` (never in production) the sign-in page also offers email/password
accounts so local dev needs no Google OAuth client.

## Dev Setup

See `docs/local-dev.md` for the full walkthrough (local Postgres, dev sign-in, pointing a
project at a local HAPI server). Short version:

1. `cp .env.example .env`, set `BETTER_AUTH_SECRET`, `CINDER_DEV_AUTH=true`,
   `CINDER_ALLOWED_FHIR_HOSTS=localhost`
2. `bun install && bun run db:up && bun run dev:server` (one terminal) and `bun run dev` (another)
3. Sign in with any email/password, create an org, create a project of type "FHIR server"
   with base URL `http://localhost:3447/fhir`

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

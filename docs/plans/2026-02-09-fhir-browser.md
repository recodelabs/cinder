# FHIR Browser for Google Cloud Healthcare API — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React SPA that browses, searches, and edits FHIR resources in Google Cloud Healthcare API, reusing Medplum's open-source components for display/input.

**Architecture:** A Vite+React app with Google OAuth2 for auth, a Vite dev proxy for CORS, a MedplumClient subclass that overrides 3 methods (requestSchema, requestProfileSchema, valueSetExpand) and delegates all FHIR REST operations through the proxy to Healthcare API. Medplum's pure display/input components work unmodified via MedplumProvider.

**Tech Stack:** Bun (runtime), Vite (bundler), React 19, Mantine 8, React Router 7, Google Identity Services, `@medplum/core` 5.0.14, `@medplum/react` 5.0.14, `@medplum/fhirtypes` 5.0.14, `@medplum/definitions` 5.0.14, Vitest (testing)

---

## Key Decisions

**CORS:** Vite dev server proxy from day one. Maps `/fhir/*` to `https://healthcare.googleapis.com/v1/projects/{p}/locations/{l}/datasets/{d}/fhirStores/{s}/fhir/*`. Production proxy TBD (Cloud Run or API Gateway).

**MedplumClient Adapter:** Subclass `MedplumClient` with `fhirUrlPath` option (discovered at line 981 of client.ts). Override 3 methods:
- `requestSchema()` → no-op (schemas pre-loaded from @medplum/definitions)
- `requestProfileSchema()` → no-op
- `valueSetExpand()` → two-tier terminology strategy (see below)

Everything else (readResource, createResource, search, cache, events, pagination) works via the proxy because `fhirUrl()` builds relative URLs from `fhirBaseUrl`.

**ValueSet Strategy (Two-Tier):**
- **Tier A — Bundled ValueSets:** Ship ~20 common administrative ValueSets as JSON (administrative-gender, marital-status, contact-point-system, etc.). `valueSetExpand()` checks local bundle first.
- **Tier B — Public terminology server:** Proxy `$expand` calls to `https://tx.fhir.org/r4/` for SNOMED, LOINC, ICD-10. Handles clinical code lookups.

**Auth:** GIS implicit flow for v1. Good enough for internal tooling. Tokens expire in 1 hour; user re-authenticates.

---

## Phase 1: Read-Only Browser (Tasks 1–10)

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `postcss.config.cjs`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Initialize the project with Bun**

```bash
cd /Volumes/Biliba/github/cinder
bun init -y
```

Then replace package.json with:

```json
{
  "name": "cinder",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 2: Install dependencies**

```bash
cd /Volumes/Biliba/github/cinder

# Core deps
bun add react react-dom react-router @mantine/core @mantine/hooks @mantine/notifications @mantine/spotlight @tabler/icons-react rfc6902 signature_pad

# Medplum deps
bun add @medplum/core @medplum/fhirtypes @medplum/definitions @medplum/react @medplum/react-hooks

# Dev deps
bun add -d typescript @types/react @types/react-dom @vitejs/plugin-react vite vitest @testing-library/react @testing-library/jest-dom @testing-library/dom @testing-library/user-event jsdom postcss postcss-preset-mantine
```

**Step 3: Create config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

`vite.config.ts` — includes the CORS proxy:
```typescript
// ABOUTME: Vite configuration for the Cinder FHIR browser app.
// ABOUTME: Configures React plugin, test setup, CORS proxy, and Mantine PostCSS.
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const project = env.VITE_GCP_PROJECT ?? '';
  const location = env.VITE_GCP_LOCATION ?? '';
  const dataset = env.VITE_GCP_DATASET ?? '';
  const fhirStore = env.VITE_GCP_FHIR_STORE ?? '';

  const targetBase = `https://healthcare.googleapis.com/v1/projects/${project}/locations/${location}/datasets/${dataset}/fhirStores/${fhirStore}/fhir`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/fhir': {
          target: targetBase,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/fhir/, ''),
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test.setup.ts',
    },
  };
});
```

`postcss.config.cjs`:
```javascript
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
  },
};
```

`.env.example`:
```
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_GCP_PROJECT=your-gcp-project
VITE_GCP_LOCATION=us-central1
VITE_GCP_DATASET=your-dataset
VITE_GCP_FHIR_STORE=your-fhir-store
```

`index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cinder — FHIR Browser</title>
    <script src="https://accounts.google.com/gsi/client" async defer></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
// ABOUTME: Application entry point.
// ABOUTME: Mounts the React app with Mantine theme provider.
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <App />
    </MantineProvider>
  </StrictMode>
);
```

`src/App.tsx`:
```tsx
// ABOUTME: Root application component.
// ABOUTME: Renders the app shell with routing.
export function App(): JSX.Element {
  return <div>Cinder FHIR Browser</div>;
}
```

`.gitignore`:
```
node_modules/
dist/
.vite/
*.log
.env
.env.local
```

**Step 4: Verify the app builds and runs**

```bash
cd /Volumes/Biliba/github/cinder
bun run build
```

Expected: Successful build with no errors.

**Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts postcss.config.cjs index.html src/ .gitignore .env.example bun.lock
git commit -m "scaffold: Vite + React + Mantine + Medplum project with CORS proxy"
```

---

### Task 2: Schema Loading and Test Setup

**Files:**
- Create: `src/test.setup.ts`
- Create: `src/schemas.ts`
- Create: `src/schemas.test.ts`

**Step 1: Write the failing test**

`src/schemas.test.ts`:
```typescript
// ABOUTME: Tests that FHIR schemas load correctly at startup.
// ABOUTME: Verifies StructureDefinitions and SearchParameters are indexed.
import { getDataType } from '@medplum/core';
import { describe, expect, it } from 'vitest';
import { loadSchemas } from './schemas';

describe('Schema loading', () => {
  it('loads Patient StructureDefinition', () => {
    loadSchemas();
    const patient = getDataType('Patient');
    expect(patient).toBeDefined();
    expect(patient.elements).toBeDefined();
  });

  it('loads Observation StructureDefinition', () => {
    loadSchemas();
    const obs = getDataType('Observation');
    expect(obs).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: FAIL — `loadSchemas` is not defined.

**Step 3: Write minimal implementation**

`src/test.setup.ts`:
```typescript
// ABOUTME: Global test setup for Vitest.
// ABOUTME: Loads FHIR schemas so components can resolve types in tests.
import { loadSchemas } from './schemas';

loadSchemas();
```

`src/schemas.ts`:
```typescript
// ABOUTME: Loads FHIR R4 StructureDefinitions and SearchParameters into memory.
// ABOUTME: Must be called once at app startup before rendering FHIR components.
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';

let loaded = false;

export function loadSchemas(): void {
  if (loaded) {
    return;
  }
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);

  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
  }

  loaded = true;
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/schemas.ts src/schemas.test.ts src/test.setup.ts
git commit -m "feat: load FHIR R4 schemas at startup"
```

---

### Task 3: Google OAuth2 Authentication

**Files:**
- Create: `src/auth/google-auth.ts`
- Create: `src/auth/google-auth.test.ts`
- Create: `src/auth/AuthProvider.tsx`
- Create: `src/auth/AuthProvider.test.tsx`

GIS implicit flow for v1 — no backend needed. Tokens expire in 1 hour.

**Step 1: Write the failing test for token management**

`src/auth/google-auth.test.ts`:
```typescript
// ABOUTME: Tests for Google OAuth2 token management.
// ABOUTME: Verifies token storage, expiry detection, and sign-out.
import { describe, expect, it, beforeEach } from 'vitest';
import { TokenStore } from './google-auth';

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore();
  });

  it('starts with no token', () => {
    expect(store.getAccessToken()).toBeUndefined();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('stores a token', () => {
    store.setToken({ access_token: 'abc123', expires_in: 3600 });
    expect(store.getAccessToken()).toBe('abc123');
    expect(store.isAuthenticated()).toBe(true);
  });

  it('clears token on sign out', () => {
    store.setToken({ access_token: 'abc123', expires_in: 3600 });
    store.clear();
    expect(store.getAccessToken()).toBeUndefined();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('detects expired tokens', () => {
    store.setToken({ access_token: 'abc123', expires_in: -1 });
    expect(store.isAuthenticated()).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: FAIL

**Step 3: Write minimal implementation**

`src/auth/google-auth.ts`:
```typescript
// ABOUTME: Manages Google OAuth2 access tokens for Healthcare API requests.
// ABOUTME: Handles token storage, expiry tracking, and the GIS token model flow.

export interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export class TokenStore {
  private accessToken: string | undefined;
  private expiresAt: number | undefined;

  getAccessToken(): string | undefined {
    if (this.expiresAt && Date.now() >= this.expiresAt) {
      this.clear();
    }
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return this.getAccessToken() !== undefined;
  }

  setToken(response: TokenResponse): void {
    this.accessToken = response.access_token;
    this.expiresAt = Date.now() + response.expires_in * 1000;
  }

  clear(): void {
    this.accessToken = undefined;
    this.expiresAt = undefined;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS

**Step 5: Write the AuthProvider React context**

`src/auth/AuthProvider.tsx`:
```tsx
// ABOUTME: React context provider for Google OAuth2 authentication state.
// ABOUTME: Exposes sign-in/sign-out and access token to child components.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { TokenStore, type TokenResponse } from './google-auth';

interface AuthContextValue {
  isAuthenticated: boolean;
  accessToken: string | undefined;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const tokenStore = new TokenStore();

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPES = 'https://www.googleapis.com/auth/cloud-platform';

interface AuthProviderProps {
  readonly children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [authenticated, setAuthenticated] = useState(tokenStore.isAuthenticated());

  const handleTokenResponse = useCallback((response: TokenResponse) => {
    tokenStore.setToken(response);
    setAuthenticated(true);
  }, []);

  const signIn = useCallback(() => {
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      console.error('Google Identity Services not loaded');
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: handleTokenResponse,
    });
    client.requestAccessToken();
  }, [handleTokenResponse]);

  const signOut = useCallback(() => {
    const token = tokenStore.getAccessToken();
    if (token) {
      const google = (window as any).google;
      google?.accounts?.oauth2?.revoke?.(token);
    }
    tokenStore.clear();
    setAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated: authenticated,
      accessToken: tokenStore.getAccessToken(),
      signIn,
      signOut,
    }),
    [authenticated, signIn, signOut]
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

**Step 6: Write AuthProvider test**

`src/auth/AuthProvider.test.tsx`:
```tsx
// ABOUTME: Tests for AuthProvider context.
// ABOUTME: Verifies authentication state is exposed to child components.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';

function TestConsumer(): JSX.Element {
  const { isAuthenticated } = useAuth();
  return <div>{isAuthenticated ? 'signed-in' : 'signed-out'}</div>;
}

describe('AuthProvider', () => {
  it('starts as signed out', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    expect(screen.getByText('signed-out')).toBeDefined();
  });
});
```

**Step 7: Run all tests**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS

**Step 8: Commit**

```bash
git add src/auth/
git commit -m "feat: Google OAuth2 token management and AuthProvider"
```

---

### Task 4: FHIR Client Adapter (via Proxy)

**Files:**
- Create: `src/fhir/client.ts`
- Create: `src/fhir/client.test.ts`

Thin adapter that talks to our Vite proxy at `/fhir/*`. The proxy handles URL rewriting to Healthcare API.

**Step 1: Write the failing test**

`src/fhir/client.test.ts`:
```typescript
// ABOUTME: Tests for the Healthcare API FHIR client adapter.
// ABOUTME: Verifies URL construction, CRUD operations, and auth header injection.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HealthcareFhirClient } from './client';

describe('HealthcareFhirClient', () => {
  let client: HealthcareFhirClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resourceType: 'Patient', id: '123' }),
      status: 200,
    });
    vi.stubGlobal('fetch', mockFetch);

    client = new HealthcareFhirClient({
      getAccessToken: () => 'test-token',
    });
  });

  it('uses /fhir as the base URL (proxy path)', () => {
    expect(client.baseUrl).toBe('/fhir');
  });

  it('reads a resource via proxy', async () => {
    const result = await client.read('Patient', '123');
    expect(mockFetch).toHaveBeenCalledWith(
      '/fhir/Patient/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
    expect(result).toEqual({ resourceType: 'Patient', id: '123' });
  });

  it('searches resources', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [],
        }),
      status: 200,
    });

    const params = new URLSearchParams({ name: 'Smith' });
    await client.search('Patient', params);

    expect(mockFetch).toHaveBeenCalledWith(
      '/fhir/Patient?name=Smith',
      expect.any(Object)
    );
  });

  it('creates a resource', async () => {
    const patient = { resourceType: 'Patient' as const, name: [{ family: 'Smith' }] };
    await client.create(patient);

    expect(mockFetch).toHaveBeenCalledWith(
      '/fhir/Patient',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(patient),
      })
    );
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'not-found' }],
        }),
    });

    await expect(client.read('Patient', 'missing')).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: FAIL — `HealthcareFhirClient` not found.

**Step 3: Write minimal implementation**

`src/fhir/client.ts`:
```typescript
// ABOUTME: FHIR client that talks to the Vite proxy at /fhir/*.
// ABOUTME: The proxy rewrites URLs to Google Cloud Healthcare API endpoints.
import type { Bundle, OperationOutcome, Resource } from '@medplum/fhirtypes';

export interface HealthcareFhirClientConfig {
  getAccessToken: () => string | undefined;
  baseUrl?: string;
}

export class FhirClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly outcome: OperationOutcome
  ) {
    super(outcome.issue?.[0]?.diagnostics ?? `HTTP ${status}`);
    this.name = 'FhirClientError';
  }
}

export class HealthcareFhirClient {
  readonly baseUrl: string;
  private readonly getAccessToken: () => string | undefined;

  constructor(config: HealthcareFhirClientConfig) {
    this.baseUrl = config.baseUrl ?? '/fhir';
    this.getAccessToken = config.getAccessToken;
  }

  async read<T extends Resource = Resource>(resourceType: string, id: string): Promise<T> {
    return this.request<T>(`${this.baseUrl}/${resourceType}/${id}`);
  }

  async search<T extends Resource = Resource>(
    resourceType: string,
    params?: URLSearchParams
  ): Promise<Bundle<T>> {
    const query = params?.toString();
    const url = query
      ? `${this.baseUrl}/${resourceType}?${query}`
      : `${this.baseUrl}/${resourceType}`;
    return this.request<Bundle<T>>(url);
  }

  async create<T extends Resource = Resource>(resource: T): Promise<T> {
    return this.request<T>(`${this.baseUrl}/${resource.resourceType}`, {
      method: 'POST',
      body: JSON.stringify(resource),
    });
  }

  async update<T extends Resource = Resource>(resource: T): Promise<T> {
    return this.request<T>(`${this.baseUrl}/${resource.resourceType}/${resource.id}`, {
      method: 'PUT',
      body: JSON.stringify(resource),
    });
  }

  async delete(resourceType: string, id: string): Promise<void> {
    await this.request(`${this.baseUrl}/${resourceType}/${id}`, {
      method: 'DELETE',
    });
  }

  async history(resourceType: string, id: string): Promise<Bundle> {
    return this.request<Bundle>(`${this.baseUrl}/${resourceType}/${id}/_history`);
  }

  async everything(patientId: string): Promise<Bundle> {
    return this.request<Bundle>(`${this.baseUrl}/Patient/${patientId}/$everything`);
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const token = this.getAccessToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/fhir+json',
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const outcome = (await response.json()) as OperationOutcome;
      throw new FhirClientError(response.status, outcome);
    }

    return response.json() as Promise<T>;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/fhir/
git commit -m "feat: FHIR client adapter with proxy support"
```

---

### Task 5: FHIR Store Configuration UI

**Files:**
- Create: `src/config/StoreConfig.ts`
- Create: `src/config/StoreSelector.tsx`
- Create: `src/config/StoreSelector.test.tsx`

Users need to specify which GCP project/dataset/store to browse. Store config in localStorage for persistence.

**Step 1: Write the failing test**

`src/config/StoreSelector.test.tsx`:
```tsx
// ABOUTME: Tests for the FHIR store configuration selector.
// ABOUTME: Verifies form submission and config persistence.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StoreSelector } from './StoreSelector';

function renderWithMantine(ui: JSX.Element): ReturnType<typeof render> {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('StoreSelector', () => {
  it('renders form fields for project, location, dataset, store', () => {
    renderWithMantine(<StoreSelector onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Project ID')).toBeDefined();
    expect(screen.getByLabelText('Location')).toBeDefined();
    expect(screen.getByLabelText('Dataset')).toBeDefined();
    expect(screen.getByLabelText('FHIR Store')).toBeDefined();
  });

  it('calls onSubmit with config values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<StoreSelector onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Project ID'), 'my-project');
    await user.type(screen.getByLabelText('Location'), 'us-central1');
    await user.type(screen.getByLabelText('Dataset'), 'my-dataset');
    await user.type(screen.getByLabelText('FHIR Store'), 'my-store');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      project: 'my-project',
      location: 'us-central1',
      dataset: 'my-dataset',
      fhirStore: 'my-store',
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

**Step 3: Write implementation**

`src/config/StoreConfig.ts`:
```typescript
// ABOUTME: Type definition and localStorage persistence for FHIR store config.
// ABOUTME: Stores GCP project/location/dataset/store coordinates.

export interface StoreConfig {
  project: string;
  location: string;
  dataset: string;
  fhirStore: string;
}

const STORAGE_KEY = 'cinder:store-config';

export function loadStoreConfig(): StoreConfig | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoreConfig) : undefined;
  } catch {
    return undefined;
  }
}

export function saveStoreConfig(config: StoreConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
```

`src/config/StoreSelector.tsx`:
```tsx
// ABOUTME: Form for selecting which GCP FHIR store to browse.
// ABOUTME: Collects project, location, dataset, and store name.
import { Button, Stack, TextInput } from '@mantine/core';
import { useCallback, useState } from 'react';
import type { StoreConfig } from './StoreConfig';
import { loadStoreConfig } from './StoreConfig';

interface StoreSelectorProps {
  readonly onSubmit: (config: StoreConfig) => void;
}

export function StoreSelector({ onSubmit }: StoreSelectorProps): JSX.Element {
  const saved = loadStoreConfig();
  const [project, setProject] = useState(saved?.project ?? '');
  const [location, setLocation] = useState(saved?.location ?? '');
  const [dataset, setDataset] = useState(saved?.dataset ?? '');
  const [fhirStore, setFhirStore] = useState(saved?.fhirStore ?? '');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit({ project, location, dataset, fhirStore });
    },
    [project, location, dataset, fhirStore, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TextInput label="Project ID" value={project} onChange={(e) => setProject(e.currentTarget.value)} required />
        <TextInput label="Location" value={location} onChange={(e) => setLocation(e.currentTarget.value)} required />
        <TextInput label="Dataset" value={dataset} onChange={(e) => setDataset(e.currentTarget.value)} required />
        <TextInput label="FHIR Store" value={fhirStore} onChange={(e) => setFhirStore(e.currentTarget.value)} required />
        <Button type="submit">Connect</Button>
      </Stack>
    </form>
  );
}
```

**Step 4: Run tests**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/config/
git commit -m "feat: FHIR store selector with localStorage persistence"
```

---

### Task 6: Reference Cache

**Files:**
- Create: `src/fhir/cache.ts`
- Create: `src/fhir/cache.test.ts`

LRU cache for resolved FHIR references. Prevents redundant fetches.

**Step 1: Write the failing test**

`src/fhir/cache.test.ts`:
```typescript
// ABOUTME: Tests for the FHIR reference resolution cache.
// ABOUTME: Verifies caching, eviction, and reference resolution.
import { describe, expect, it } from 'vitest';
import { ReferenceCache } from './cache';
import type { Patient } from '@medplum/fhirtypes';

describe('ReferenceCache', () => {
  it('stores and retrieves resources', () => {
    const cache = new ReferenceCache(100);
    const patient: Patient = { resourceType: 'Patient', id: '123' };
    cache.set('Patient/123', patient);
    expect(cache.get('Patient/123')).toBe(patient);
  });

  it('returns undefined for unknown references', () => {
    const cache = new ReferenceCache(100);
    expect(cache.get('Patient/unknown')).toBeUndefined();
  });

  it('evicts oldest entries when full', () => {
    const cache = new ReferenceCache(2);
    cache.set('Patient/1', { resourceType: 'Patient', id: '1' });
    cache.set('Patient/2', { resourceType: 'Patient', id: '2' });
    cache.set('Patient/3', { resourceType: 'Patient', id: '3' });

    expect(cache.get('Patient/1')).toBeUndefined();
    expect(cache.get('Patient/3')).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

**Step 3: Write implementation**

`src/fhir/cache.ts`:
```typescript
// ABOUTME: LRU cache for resolved FHIR references.
// ABOUTME: Prevents redundant fetches when the same resource is referenced multiple times.
import type { Resource } from '@medplum/fhirtypes';

export class ReferenceCache {
  private readonly cache = new Map<string, Resource>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): Resource | undefined {
    const value = this.cache.get(key);
    if (value) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: Resource): void {
    this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

**Step 4: Run tests**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/fhir/cache.ts src/fhir/cache.test.ts
git commit -m "feat: LRU reference cache for FHIR resources"
```

---

### Task 7: MedplumClient Subclass

**Files:**
- Create: `src/fhir/medplum-adapter.ts`
- Create: `src/fhir/medplum-adapter.test.ts`

Subclass MedplumClient. Set `fhirUrlPath` to route through proxy. Override `requestSchema()` and `requestProfileSchema()` as no-ops since schemas are pre-loaded.

**Step 1: Write the failing test**

`src/fhir/medplum-adapter.test.ts`:
```typescript
// ABOUTME: Tests for the MedplumClient subclass that bridges to Healthcare API.
// ABOUTME: Verifies proxy URL construction and schema method overrides.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HealthcareMedplumClient } from './medplum-adapter';

describe('HealthcareMedplumClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resourceType: 'Patient', id: '123' }),
      status: 200,
      headers: new Headers({ 'content-type': 'application/fhir+json' }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  it('uses /fhir as the FHIR URL path', () => {
    const client = new HealthcareMedplumClient({ getAccessToken: () => 'tok' });
    const url = client.fhirUrl('Patient', '123');
    expect(url.pathname).toBe('/fhir/Patient/123');
  });

  it('requestSchema is a no-op', async () => {
    const client = new HealthcareMedplumClient({ getAccessToken: () => 'tok' });
    await client.requestSchema('Patient');
    // Should not throw or make fetch calls
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requestProfileSchema is a no-op', async () => {
    const client = new HealthcareMedplumClient({ getAccessToken: () => 'tok' });
    await client.requestProfileSchema('http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

**Step 3: Write implementation**

`src/fhir/medplum-adapter.ts`:
```typescript
// ABOUTME: MedplumClient subclass that routes FHIR operations through the proxy.
// ABOUTME: Overrides schema methods (pre-loaded) and injects auth headers.
import { MedplumClient } from '@medplum/core';

export interface HealthcareMedplumClientConfig {
  getAccessToken: () => string | undefined;
}

export class HealthcareMedplumClient extends MedplumClient {
  constructor(config: HealthcareMedplumClientConfig) {
    const getAccessToken = config.getAccessToken;

    super({
      baseUrl: globalThis.location?.origin ?? 'http://localhost:5173',
      fhirUrlPath: 'fhir',
      fetch: (url: string | URL, init?: RequestInit) => {
        const token = getAccessToken();
        const headers = new Headers(init?.headers);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(url, { ...init, headers });
      },
    });
  }

  override async requestSchema(): Promise<void> {
    // Schemas are pre-loaded from @medplum/definitions at startup
    return;
  }

  override async requestProfileSchema(): Promise<void> {
    // Profiles are pre-loaded from @medplum/definitions at startup
    return;
  }
}
```

**Step 4: Run tests**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/fhir/medplum-adapter.ts src/fhir/medplum-adapter.test.ts
git commit -m "feat: MedplumClient subclass with proxy routing and schema overrides"
```

---

### Task 8: App Shell with Routing

**Files:**
- Modify: `src/App.tsx`
- Create: `src/Shell.tsx`
- Create: `src/Shell.test.tsx`
- Create: `src/pages/HomePage.tsx`
- Create: `src/pages/ResourceTypePage.tsx`
- Create: `src/pages/ResourceDetailPage.tsx`

**Step 1: Write the failing test**

`src/Shell.test.tsx`:
```tsx
// ABOUTME: Tests for the application shell layout.
// ABOUTME: Verifies navigation, resource type list, and route rendering.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Shell } from './Shell';

function renderShell(route = '/'): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[route]}>
        <Shell />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe('Shell', () => {
  it('renders app title', () => {
    renderShell();
    expect(screen.getByText('Cinder')).toBeDefined();
  });

  it('shows resource type list on home page', () => {
    renderShell('/');
    expect(screen.getByText('Patient')).toBeDefined();
    expect(screen.getByText('Observation')).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

**Step 3: Write implementation**

`src/Shell.tsx`:
```tsx
// ABOUTME: Application shell with sidebar navigation and route outlet.
// ABOUTME: Provides the main layout: header, resource type sidebar, content area.
import { AppShell, Group, NavLink, Text, Title } from '@mantine/core';
import { Link, Outlet } from 'react-router';

const RESOURCE_TYPES = [
  'Patient', 'Practitioner', 'Organization', 'Encounter',
  'Observation', 'Condition', 'Procedure', 'MedicationRequest',
  'AllergyIntolerance', 'Immunization', 'DiagnosticReport',
  'CarePlan', 'CareTeam', 'Claim', 'Coverage',
  'DocumentReference', 'Goal', 'Location', 'Medication',
  'ServiceRequest', 'Specimen',
];

export function Shell(): JSX.Element {
  return (
    <AppShell
      header={{ height: 50 }}
      navbar={{ width: 220, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Title order={3}>Cinder</Title>
          <Text size="sm" c="dimmed">FHIR Browser</Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {RESOURCE_TYPES.map((type) => (
          <NavLink key={type} component={Link} to={`/${type}`} label={type} />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
```

`src/pages/HomePage.tsx`:
```tsx
// ABOUTME: Landing page showing available FHIR resource types.
// ABOUTME: Provides navigation cards to browse each resource type.
import { SimpleGrid, Card, Text, Title } from '@mantine/core';
import { Link } from 'react-router';

const RESOURCE_TYPES = [
  'Patient', 'Practitioner', 'Organization', 'Encounter',
  'Observation', 'Condition', 'Procedure', 'MedicationRequest',
  'AllergyIntolerance', 'Immunization', 'DiagnosticReport',
  'CarePlan', 'CareTeam', 'DocumentReference',
];

export function HomePage(): JSX.Element {
  return (
    <>
      <Title order={2} mb="md">Resource Types</Title>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }}>
        {RESOURCE_TYPES.map((type) => (
          <Card key={type} component={Link} to={`/${type}`} shadow="sm" padding="lg" withBorder>
            <Text fw={500}>{type}</Text>
          </Card>
        ))}
      </SimpleGrid>
    </>
  );
}
```

`src/pages/ResourceTypePage.tsx`:
```tsx
// ABOUTME: Lists resources of a given type from the FHIR store.
// ABOUTME: Placeholder — will fetch live data in Task 12.
import { Title } from '@mantine/core';
import { useParams } from 'react-router';

export function ResourceTypePage(): JSX.Element {
  const { resourceType } = useParams<{ resourceType: string }>();
  return <Title order={2}>{resourceType}</Title>;
}
```

`src/pages/ResourceDetailPage.tsx`:
```tsx
// ABOUTME: Displays a single FHIR resource with all its properties.
// ABOUTME: Placeholder — will use Medplum display components in Task 10.
import { Title } from '@mantine/core';
import { useParams } from 'react-router';

export function ResourceDetailPage(): JSX.Element {
  const { resourceType, id } = useParams<{ resourceType: string; id: string }>();
  return <Title order={2}>{resourceType}/{id}</Title>;
}
```

Update `src/App.tsx`:
```tsx
// ABOUTME: Root application component with route definitions.
// ABOUTME: Sets up BrowserRouter and maps URL paths to page components.
import { BrowserRouter, Route, Routes } from 'react-router';
import { Shell } from './Shell';
import { HomePage } from './pages/HomePage';
import { ResourceTypePage } from './pages/ResourceTypePage';
import { ResourceDetailPage } from './pages/ResourceDetailPage';

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path=":resourceType" element={<ResourceTypePage />} />
          <Route path=":resourceType/:id" element={<ResourceDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

**Step 4: Run tests**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/ index.html
git commit -m "feat: app shell with routing and page scaffolds"
```

---

### Task 9: Search Results Table

**Files:**
- Create: `src/pages/SearchResultsTable.tsx`
- Create: `src/pages/SearchResultsTable.test.tsx`

Pure component — renders a FHIR Bundle as a table. No FHIR client dependency.

**Step 1: Write the failing test**

`src/pages/SearchResultsTable.test.tsx`:
```tsx
// ABOUTME: Tests for the FHIR search results table.
// ABOUTME: Verifies table rendering from a FHIR Bundle searchset.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SearchResultsTable } from './SearchResultsTable';
import type { Bundle, Patient } from '@medplum/fhirtypes';

const mockBundle: Bundle<Patient> = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: '1',
        name: [{ family: 'Smith', given: ['John'] }],
      },
    },
    {
      resource: {
        resourceType: 'Patient',
        id: '2',
        name: [{ family: 'Doe', given: ['Jane'] }],
      },
    },
  ],
};

describe('SearchResultsTable', () => {
  it('renders rows for each bundle entry', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <SearchResultsTable bundle={mockBundle} resourceType="Patient" />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(screen.getByText('Smith, John')).toBeDefined();
    expect(screen.getByText('Doe, Jane')).toBeDefined();
  });

  it('shows empty state when no entries', () => {
    const emptyBundle: Bundle = { resourceType: 'Bundle', type: 'searchset' };
    render(
      <MantineProvider>
        <MemoryRouter>
          <SearchResultsTable bundle={emptyBundle} resourceType="Patient" />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(screen.getByText(/no results/i)).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

**Step 3: Write implementation**

`src/pages/SearchResultsTable.tsx`:
```tsx
// ABOUTME: Renders FHIR search results as a table with clickable rows.
// ABOUTME: Uses getDisplayString from @medplum/core for resource summaries.
import { getDisplayString } from '@medplum/core';
import type { Bundle, Resource } from '@medplum/fhirtypes';
import { Table, Text } from '@mantine/core';
import { Link } from 'react-router';

interface SearchResultsTableProps {
  readonly bundle: Bundle;
  readonly resourceType: string;
}

export function SearchResultsTable({ bundle, resourceType }: SearchResultsTableProps): JSX.Element {
  const entries = bundle.entry ?? [];

  if (entries.length === 0) {
    return <Text c="dimmed">No results found for {resourceType}.</Text>;
  }

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>ID</Table.Th>
          <Table.Th>Display</Table.Th>
          <Table.Th>Last Updated</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map((entry) => {
          const resource = entry.resource as Resource;
          if (!resource) {
            return null;
          }
          return (
            <Table.Tr key={resource.id} component={Link} to={`/${resource.resourceType}/${resource.id}`}>
              <Table.Td>{resource.id}</Table.Td>
              <Table.Td>{getDisplayString(resource)}</Table.Td>
              <Table.Td>{resource.meta?.lastUpdated}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
```

**Step 4: Run tests**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/SearchResultsTable.tsx src/pages/SearchResultsTable.test.tsx
git commit -m "feat: search results table with display strings"
```

---

### Task 10: Resource Detail View with Medplum Display Components

**Files:**
- Modify: `src/pages/ResourceDetailPage.tsx`
- Create: `src/pages/ResourceDetail.tsx`
- Create: `src/pages/ResourceDetail.test.tsx`

Renders a resource's properties using Medplum's `ResourcePropertyDisplay` and the schema system.

**Step 1: Write the failing test**

`src/pages/ResourceDetail.test.tsx`:
```tsx
// ABOUTME: Tests for the resource detail view.
// ABOUTME: Verifies rendering of FHIR resource properties using Medplum components.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ResourceDetail } from './ResourceDetail';
import type { Patient } from '@medplum/fhirtypes';

const testPatient: Patient = {
  resourceType: 'Patient',
  id: 'test-1',
  name: [{ family: 'Smith', given: ['John'] }],
  gender: 'male',
  birthDate: '1990-01-15',
};

describe('ResourceDetail', () => {
  it('renders resource type and id', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <ResourceDetail resource={testPatient} />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(screen.getByText('Patient/test-1')).toBeDefined();
  });

  it('renders patient name', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <ResourceDetail resource={testPatient} />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(screen.getByText(/Smith/)).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

**Step 3: Write implementation**

`src/pages/ResourceDetail.tsx`:
```tsx
// ABOUTME: Displays a single FHIR resource using Medplum display components.
// ABOUTME: Renders all resource properties via the FHIR schema system.
import { getDataType } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { ResourcePropertyDisplay } from '@medplum/react';
import { Divider, Paper, Stack, Text, Title } from '@mantine/core';

interface ResourceDetailProps {
  readonly resource: Resource;
}

export function ResourceDetail({ resource }: ResourceDetailProps): JSX.Element {
  const schema = getDataType(resource.resourceType);
  const elements = schema?.elements ?? {};

  return (
    <Paper p="md" withBorder>
      <Title order={3} mb="sm">
        {resource.resourceType}/{resource.id}
      </Title>
      <Divider mb="md" />
      <Stack gap="sm">
        {Object.entries(elements).map(([key, element]) => {
          const value = (resource as Record<string, unknown>)[key];
          if (value === undefined || key === 'id' || key === 'resourceType' || key === 'meta') {
            return null;
          }
          return (
            <div key={key}>
              <Text size="sm" fw={600} c="dimmed">{key}</Text>
              <ResourcePropertyDisplay
                property={element}
                propertyType={element.type[0]?.code ?? 'string'}
                value={value}
              />
            </div>
          );
        })}
      </Stack>
    </Paper>
  );
}
```

**Step 4: Run tests**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
```

Expected: PASS (may need prop adjustments during implementation based on actual ResourcePropertyDisplay API)

**Step 5: Commit**

```bash
git add src/pages/ResourceDetail.tsx src/pages/ResourceDetail.test.tsx
git commit -m "feat: resource detail view with Medplum display components"
```

---

## Phase 2: Wiring It All Together (Tasks 11–13)

### Task 11: Wire Auth + MedplumClient + Provider

**Files:**
- Create: `src/AppProviders.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

Connect: Auth → HealthcareMedplumClient → MedplumProvider → all routes.

**Step 1: Write AppProviders**

`src/AppProviders.tsx`:
```tsx
// ABOUTME: Composes all application context providers.
// ABOUTME: Wires auth, MedplumClient subclass, and Medplum context together.
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { MedplumProvider } from '@medplum/react-hooks';
import { type ReactNode, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { HealthcareMedplumClient } from './fhir/medplum-adapter';

interface FhirProviderProps {
  readonly children: ReactNode;
}

function FhirProvider({ children }: FhirProviderProps): JSX.Element {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const medplum = useMemo(() => {
    return new HealthcareMedplumClient({
      getAccessToken: () => accessToken,
    });
  }, [accessToken]);

  return (
    <MedplumProvider medplum={medplum} navigate={navigate}>
      {children}
    </MedplumProvider>
  );
}

interface AppProvidersProps {
  readonly children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps): JSX.Element {
  return (
    <MantineProvider>
      <AuthProvider>
        <FhirProvider>{children}</FhirProvider>
      </AuthProvider>
    </MantineProvider>
  );
}
```

**Step 2: Update App.tsx and main.tsx**

Wire `AppProviders` around `BrowserRouter` and routes. Move `MantineProvider` into `AppProviders`.

**Step 3: Run tests and commit**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
git add src/AppProviders.tsx src/App.tsx src/main.tsx
git commit -m "feat: wire auth, MedplumClient, and provider"
```

---

### Task 12: Live Search with useMedplum

**Files:**
- Modify: `src/pages/ResourceTypePage.tsx`

Now that MedplumProvider is wired, ResourceTypePage can use `useMedplum()` to get the client and call `search()`. No custom hooks needed — MedplumClient already has search with caching built in.

**Step 1: Update ResourceTypePage**

```tsx
// ABOUTME: Lists resources of a given type from the FHIR store.
// ABOUTME: Fetches search results via MedplumClient and renders them in a table.
import { Loader, Stack, Title, Alert } from '@mantine/core';
import { useMedplum } from '@medplum/react-hooks';
import type { Bundle } from '@medplum/fhirtypes';
import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { SearchResultsTable } from './SearchResultsTable';

export function ResourceTypePage(): JSX.Element {
  const { resourceType } = useParams<{ resourceType: string }>();
  const medplum = useMedplum();
  const [bundle, setBundle] = useState<Bundle>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!resourceType) return;
    setLoading(true);
    setError(undefined);
    medplum
      .search(resourceType as any)
      .then((b) => setBundle(b.read()))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [medplum, resourceType]);

  return (
    <Stack>
      <Title order={2}>{resourceType}</Title>
      {loading && <Loader />}
      {error && <Alert color="red">{error.message}</Alert>}
      {bundle && <SearchResultsTable bundle={bundle} resourceType={resourceType ?? ''} />}
    </Stack>
  );
}
```

**Step 2: Run tests and commit**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
git add src/pages/ResourceTypePage.tsx
git commit -m "feat: live search via MedplumClient"
```

---

### Task 13: Resource Detail with Live Fetch

**Files:**
- Modify: `src/pages/ResourceDetailPage.tsx`

Wire `useMedplum().readResource()` → `ResourceDetail` component.

**Step 1: Update ResourceDetailPage**

```tsx
// ABOUTME: Fetches and displays a single FHIR resource.
// ABOUTME: Uses MedplumClient for fetching and ResourceDetail for rendering.
import { Loader, Stack, Alert } from '@mantine/core';
import { useMedplum } from '@medplum/react-hooks';
import type { Resource } from '@medplum/fhirtypes';
import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { ResourceDetail } from './ResourceDetail';

export function ResourceDetailPage(): JSX.Element {
  const { resourceType, id } = useParams<{ resourceType: string; id: string }>();
  const medplum = useMedplum();
  const [resource, setResource] = useState<Resource>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!resourceType || !id) return;
    setLoading(true);
    setError(undefined);
    medplum
      .readResource(resourceType as any, id)
      .then(setResource)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [medplum, resourceType, id]);

  return (
    <Stack>
      {loading && <Loader />}
      {error && <Alert color="red">{error.message}</Alert>}
      {resource && <ResourceDetail resource={resource} />}
    </Stack>
  );
}
```

**Step 2: Run tests and commit**

```bash
cd /Volumes/Biliba/github/cinder && bun run test
git add src/pages/ResourceDetailPage.tsx
git commit -m "feat: resource detail view with live FHIR fetch"
```

---

## Phase 3: Editing (Tasks 14–16, future)

### Task 14: ValueSet Expansion (Two-Tier)

**Files:**
- Create: `src/fhir/valuesets.ts`
- Create: `src/fhir/valuesets.test.ts`
- Modify: `src/fhir/medplum-adapter.ts`

Override `valueSetExpand()` in HealthcareMedplumClient:
1. Check bundled ValueSets first (administrative-gender, marital-status, etc.)
2. Fall back to `https://tx.fhir.org/r4/ValueSet/$expand` for clinical codes

### Task 15: Resource Editor with Medplum Input Components

Wire `ResourceForm` from `@medplum/react` for editing. Since we override `requestSchema()` as a no-op and schemas are pre-loaded, ResourceForm should render fields correctly. Wire save to `medplum.updateResource()`.

### Task 16: Create / Delete Operations

Add create-new-resource page and delete confirmation dialog. Wire to `medplum.createResource()` and `medplum.deleteResource()`.

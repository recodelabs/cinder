// ABOUTME: Tests for proxying to generic FHIR servers, with and without OAuth client credentials.
// ABOUTME: Runs a mock token endpoint and a mock gateway-style FHIR server (Bearer-checked, HAPI _getpages paging) with Bun.serve.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { ClientCredentialsTokens } from './fhir-auth';
import { proxyToFhirServer, type FhirServerTarget } from './fhir-proxy';

const PROXY_ORIGIN = 'http://localhost:3000';
const SECRET = 'gateway-secret';

let tokenServer: ReturnType<typeof Bun.serve>;
let fhirServer: ReturnType<typeof Bun.serve>;
let tokenUrl: string;
let fhirBase: string;

/** Tokens the mock gateway accepts. Tokens are issued as token-1, token-2, ... */
let validTokens = new Set<string>();
let tokenRequests = 0;
let tokenStatus = 200;
let fhirRequests: {
  path: string;
  search: string;
  authorization: string | null;
  ifNoneMatch: string | null;
  method: string;
  body: string;
}[] = [];
let requireAuth = true;

const LOCATIONS = ['loc-1', 'loc-2', 'loc-3', 'loc-4', 'loc-5'];

function searchset(ids: string[], offset: number, count: number, searchId: string): unknown {
  const link: { relation: string; url: string }[] = [
    { relation: 'self', url: `${fhirBase}/Location?_count=${count}` },
  ];
  if (offset + count < LOCATIONS.length) {
    // Like FHIR Info Gateway: HAPI's paging link, rewritten to the gateway's own address.
    link.push({
      relation: 'next',
      url: `${fhirBase}?_getpages=${searchId}&_getpagesoffset=${offset + count}&_count=${count}&_pretty=true&_bundletype=searchset`,
    });
  }
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    link,
    entry: ids.map((id) => ({
      fullUrl: `${fhirBase}/Location/${id}`,
      resource: { resourceType: 'Location', id },
    })),
  };
}

beforeAll(() => {
  tokenServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const form = new URLSearchParams(await req.text());
      if (form.get('client_secret') !== SECRET || tokenStatus !== 200) {
        return Response.json({ error: 'unauthorized_client' }, { status: tokenStatus === 200 ? 401 : tokenStatus });
      }
      tokenRequests += 1;
      const token = `token-${tokenRequests}`;
      validTokens.add(token);
      return Response.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
    },
  });
  fhirServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const authorization = req.headers.get('Authorization');
      fhirRequests.push({
        path: url.pathname,
        search: url.search,
        authorization,
        ifNoneMatch: req.headers.get('If-None-Match'),
        method: req.method,
        body: await req.text(),
      });

      if (url.pathname === '/fhir/metadata') {
        return Response.json({ resourceType: 'CapabilityStatement', fhirVersion: '4.0.1' });
      }
      const bearer = authorization?.replace(/^Bearer /, '');
      if (requireAuth && (!bearer || !validTokens.has(bearer))) {
        return new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } });
      }
      if (url.pathname === '/fhir/Location' && req.method === 'GET') {
        const count = Number(url.searchParams.get('_count') ?? '2');
        return Response.json(searchset(LOCATIONS.slice(0, count), 0, count, 'search-abc'));
      }
      if (url.pathname === '/fhir' && url.searchParams.has('_getpages')) {
        const offset = Number(url.searchParams.get('_getpagesoffset'));
        const count = Number(url.searchParams.get('_count'));
        return Response.json(searchset(LOCATIONS.slice(offset, offset + count), offset, count, url.searchParams.get('_getpages')!));
      }
      if (url.pathname === '/fhir/Location' && req.method === 'POST') {
        return Response.json({ resourceType: 'Location', id: 'new' }, {
          status: 201,
          headers: { Location: `${fhirBase}/Location/new/_history/1` },
        });
      }
      return Response.json({ resourceType: 'OperationOutcome', issue: [] }, { status: 404 });
    },
  });
  tokenUrl = `http://localhost:${tokenServer.port}/realms/icr/protocol/openid-connect/token`;
  fhirBase = `http://127.0.0.1:${fhirServer.port}/fhir`;
});

afterAll(() => {
  tokenServer.stop(true);
  fhirServer.stop(true);
});

let tokens: ClientCredentialsTokens;

beforeEach(() => {
  tokens = new ClientCredentialsTokens();
  validTokens = new Set();
  tokenRequests = 0;
  tokenStatus = 200;
  fhirRequests = [];
  requireAuth = true;
});

const ALLOWED = 'localhost,127.0.0.1';

function gatewayTarget(overrides: Partial<NonNullable<FhirServerTarget['auth']>> = {}): FhirServerTarget {
  return {
    baseUrl: fhirBase,
    auth: { authKey: 'project-1', tokenUrl, clientId: 'key-test', clientSecret: SECRET, ...overrides },
  };
}

async function proxyGet(path: string, target: FhirServerTarget, allowedHosts = ALLOWED): Promise<Response> {
  const url = new URL(`${PROXY_ORIGIN}${path}`);
  return proxyToFhirServer(new Request(url), url, target, { allowedHosts, tokens });
}

describe('proxyToFhirServer with client credentials', () => {
  it('sends a Bearer token from the token endpoint', async () => {
    const res = await proxyGet('/fhir/Location?_count=2', gatewayTarget());
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as { entry: { resource: { id: string } }[] };
    expect(bundle.entry.map((e) => e.resource.id)).toEqual(['loc-1', 'loc-2']);
    expect(fhirRequests[0]!.authorization).toBe('Bearer token-1');
  });

  it('reuses the cached token across requests', async () => {
    await proxyGet('/fhir/Location?_count=2', gatewayTarget());
    await proxyGet('/fhir/Location?_count=2', gatewayTarget());
    expect(tokenRequests).toBe(1);
    expect(fhirRequests.map((r) => r.authorization)).toEqual(['Bearer token-1', 'Bearer token-1']);
  });

  it('pages through next links that carry the gateway address', async () => {
    const seen: string[] = [];
    let path: string | undefined = '/fhir/Location?_count=2';
    while (path) {
      const res = await proxyGet(path, gatewayTarget());
      expect(res.status).toBe(200);
      const bundle = (await res.json()) as { entry: { resource: { id: string } }[]; link: { relation: string; url: string }[] };
      seen.push(...bundle.entry.map((e) => e.resource.id));
      const next = bundle.link.find((l) => l.relation === 'next')?.url;
      if (next) {
        // The browser only ever sees the proxy's address, never the gateway's.
        expect(next.startsWith(`${PROXY_ORIGIN}/fhir/Location?_page_token=`)).toBe(true);
        expect(next).not.toContain(String(fhirServer.port));
      }
      path = next?.slice(PROXY_ORIGIN.length);
    }
    expect(seen).toEqual(LOCATIONS);
    const pageRequests = fhirRequests.filter((r) => r.path === '/fhir');
    expect(pageRequests).toHaveLength(2);
    expect(pageRequests[0]!.search).toContain('_getpages=search-abc&_getpagesoffset=2');
    expect(pageRequests.every((r) => r.authorization === 'Bearer token-1')).toBe(true);
  });

  it('refreshes the token once when the server returns 401', async () => {
    await proxyGet('/fhir/Location?_count=2', gatewayTarget());
    validTokens.delete('token-1'); // revoked, or expired early on the server side

    const res = await proxyGet('/fhir/Location?_count=2', gatewayTarget());
    expect(res.status).toBe(200);
    expect(tokenRequests).toBe(2);
    expect(fhirRequests.map((r) => r.authorization)).toEqual(['Bearer token-1', 'Bearer token-1', 'Bearer token-2']);
  });

  it('replays the request body on the retry', async () => {
    await proxyGet('/fhir/metadata', gatewayTarget());
    validTokens.clear();
    const url = new URL(`${PROXY_ORIGIN}/fhir/Location`);
    const body = JSON.stringify({ resourceType: 'Location', name: 'Test' });
    const req = new Request(url, { method: 'POST', body, headers: { 'Content-Type': 'application/fhir+json' } });
    const res = await proxyToFhirServer(req, url, gatewayTarget(), { allowedHosts: ALLOWED, tokens });
    expect(res.status).toBe(201);
    expect(res.headers.get('Location')).toBe(`${PROXY_ORIGIN}/fhir/Location/new/_history/1`);
    const posts = fhirRequests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts.every((r) => r.body === body)).toBe(true);
  });

  it('retries only once and does not pass a 401 to the browser', async () => {
    requireAuth = true;
    const target = gatewayTarget();
    // Every token is rejected.
    const res = await proxyToFhirServer(
      new Request(`${PROXY_ORIGIN}/fhir/Location`),
      new URL(`${PROXY_ORIGIN}/fhir/Location`),
      target,
      { allowedHosts: ALLOWED, tokens: rejectingTokens() },
    );
    expect(res.status).toBe(403);
    const outcome = (await res.json()) as { resourceType: string; issue: { diagnostics: string }[] };
    expect(outcome.resourceType).toBe('OperationOutcome');
    expect(outcome.issue[0]!.diagnostics).toContain('rejected the access token');
    expect(fhirRequests).toHaveLength(2);
  });

  it('returns 403 without calling the FHIR server when the token endpoint rejects the credentials', async () => {
    tokenStatus = 401;
    const res = await proxyGet('/fhir/Location', gatewayTarget());
    expect(res.status).toBe(403);
    const outcome = (await res.json()) as { issue: { diagnostics: string }[] };
    expect(outcome.issue[0]!.diagnostics).toContain('Token endpoint returned 401 (unauthorized_client)');
    expect(outcome.issue[0]!.diagnostics).not.toContain(SECRET);
    expect(fhirRequests).toHaveLength(0);
  });

  it('returns a retryable 502 when the token endpoint itself fails', async () => {
    tokenStatus = 503;
    const res = await proxyGet('/fhir/Location', gatewayTarget());
    expect(res.status).toBe(502);
    expect(fhirRequests).toHaveLength(0);
  });

  it('refuses a token URL whose host is not on the allowlist, before sending the secret', async () => {
    const res = await proxyGet('/fhir/Location', gatewayTarget(), '127.0.0.1');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain('token URL host is not allowed');
    expect(tokenRequests).toBe(0);
    expect(fhirRequests).toHaveLength(0);
  });

  it('refuses a FHIR base URL whose host is not on the allowlist', async () => {
    const res = await proxyGet('/fhir/Location', gatewayTarget(), 'localhost');
    expect(res.status).toBe(503);
    expect(tokenRequests).toBe(0);
  });
});

describe('proxyToFhirServer without credentials', () => {
  it('sends no Authorization header to an open server', async () => {
    requireAuth = false;
    const res = await proxyGet('/fhir/Location?_count=2', { baseUrl: fhirBase });
    expect(res.status).toBe(200);
    expect(fhirRequests[0]!.authorization).toBeNull();
    expect(tokenRequests).toBe(0);
  });

  it('turns an upstream 401 into a 403 that explains credentials are needed', async () => {
    const res = await proxyGet('/fhir/Location', { baseUrl: fhirBase });
    expect(res.status).toBe(403);
    const outcome = (await res.json()) as { issue: { diagnostics: string }[] };
    expect(outcome.issue[0]!.diagnostics).toContain('Add client credentials to the project');
    expect(fhirRequests).toHaveLength(1);
  });

  it('does not forward the browser cache validator If-None-Match', async () => {
    requireAuth = false;
    const url = new URL(`${PROXY_ORIGIN}/fhir/Location?_count=2`);
    const req = new Request(url, { headers: { 'If-None-Match': 'W/"1"' } });
    const res = await proxyToFhirServer(req, url, { baseUrl: fhirBase }, { allowedHosts: ALLOWED, tokens });
    expect(res.status).toBe(200);
    expect(fhirRequests[0]!.ifNoneMatch).toBeNull();
  });

  it('still reads open endpoints such as metadata', async () => {
    const res = await proxyGet('/fhir/metadata', { baseUrl: fhirBase });
    expect(res.status).toBe(200);
  });
});

/** A token store whose tokens the mock server never accepts. */
function rejectingTokens(): ClientCredentialsTokens {
  let n = 0;
  const store = new ClientCredentialsTokens();
  store.get = async () => `bogus-${++n}`;
  return store;
}

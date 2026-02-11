// ABOUTME: Tests for the Bun production server.
// ABOUTME: Verifies static file serving, SPA fallback, FHIR proxy routing, and security.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { createServer, isValidStoreBase } from './server';

const TEST_DIST = './dist-test';
let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  mkdirSync(`${TEST_DIST}/assets`, { recursive: true });
  writeFileSync(`${TEST_DIST}/index.html`, '<html><body>SPA</body></html>');
  writeFileSync(`${TEST_DIST}/assets/app.js`, 'console.log("app")');

  server = createServer({ port: 0, distDir: TEST_DIST });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop();
  rmSync(TEST_DIST, { recursive: true, force: true });
});

describe('security headers', () => {
  it('includes Content-Security-Policy on HTML responses', async () => {
    const res = await fetch(`${baseUrl}/`);
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('accounts.google.com');
    expect(csp).toContain('healthcare.googleapis.com');
  });

  it('includes X-Content-Type-Options header', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('includes X-Frame-Options header', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

describe('static file serving', () => {
  it('serves index.html at root', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SPA');
  });

  it('rejects path traversal attempts', async () => {
    const res = await fetch(`${baseUrl}/../../../etc/passwd`);
    const text = await res.text();
    expect(text).toContain('SPA');
  });

  it('rejects encoded path traversal attempts', async () => {
    const res = await fetch(`${baseUrl}/assets/..%2F..%2F..%2Fetc%2Fpasswd`);
    const text = await res.text();
    expect(text).not.toContain('root:');
  });

  it('serves static assets', async () => {
    const res = await fetch(`${baseUrl}/assets/app.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('console.log("app")');
  });
});

describe('SPA fallback', () => {
  it('returns index.html for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/Patient/123`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SPA');
  });

  it('returns index.html for deep routes', async () => {
    const res = await fetch(`${baseUrl}/Patient/123/details`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SPA');
  });
});

describe('isValidStoreBase', () => {
  it('accepts valid GCP Healthcare API URLs', () => {
    expect(isValidStoreBase(
      'https://healthcare.googleapis.com/v1/projects/my-project/locations/us-central1/datasets/my-dataset/fhirStores/my-store'
    )).toBe(true);
  });

  it('accepts URLs with hyphens and underscores in resource names', () => {
    expect(isValidStoreBase(
      'https://healthcare.googleapis.com/v1/projects/ada-health_123/locations/us-east1/datasets/demo-fhir/fhirStores/store_v2'
    )).toBe(true);
  });

  it('rejects cloud metadata URLs', () => {
    expect(isValidStoreBase('http://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('rejects non-https scheme', () => {
    expect(isValidStoreBase(
      'http://healthcare.googleapis.com/v1/projects/p/locations/l/datasets/d/fhirStores/s'
    )).toBe(false);
  });

  it('rejects non-Healthcare API hosts', () => {
    expect(isValidStoreBase(
      'https://evil.com/v1/projects/p/locations/l/datasets/d/fhirStores/s'
    )).toBe(false);
  });

  it('rejects URLs with trailing path segments', () => {
    expect(isValidStoreBase(
      'https://healthcare.googleapis.com/v1/projects/p/locations/l/datasets/d/fhirStores/s/fhir/Patient'
    )).toBe(false);
  });

  it('rejects URLs with path traversal in resource names', () => {
    expect(isValidStoreBase(
      'https://healthcare.googleapis.com/v1/projects/../other/locations/l/datasets/d/fhirStores/s'
    )).toBe(false);
  });
});

describe('FHIR proxy', () => {
  it('returns 400 when X-Store-Base header is missing', async () => {
    const res = await fetch(`${baseUrl}/fhir/Patient/123`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('X-Store-Base');
  });

  it('rejects X-Store-Base that is not a Healthcare API URL', async () => {
    const res = await fetch(`${baseUrl}/fhir/Patient/123`, {
      headers: { 'X-Store-Base': 'http://169.254.169.254/latest/meta-data' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('X-Store-Base');
  });

  it('rejects X-Store-Base with a non-https scheme', async () => {
    const res = await fetch(`${baseUrl}/fhir/Patient/123`, {
      headers: {
        'X-Store-Base': 'http://healthcare.googleapis.com/v1/projects/p/locations/l/datasets/d/fhirStores/s',
      },
    });
    expect(res.status).toBe(400);
  });
});

describe('FHIR proxy forwarding', () => {
  // These tests use a permissive validator to test proxy mechanics with local mock servers
  let proxyServer: ReturnType<typeof createServer>;
  let proxyBaseUrl: string;

  beforeAll(() => {
    proxyServer = createServer({
      port: 0,
      distDir: TEST_DIST,
      validateStoreBase: () => true,
    });
    proxyBaseUrl = `http://localhost:${proxyServer.port}`;
  });

  afterAll(() => {
    proxyServer.stop();
  });

  it('proxies requests to the store base URL', async () => {
    const mockBackend = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        return Response.json({
          receivedPath: url.pathname + url.search,
          receivedAuth: req.headers.get('Authorization'),
        });
      },
    });

    try {
      const storeBase = `http://localhost:${mockBackend.port}/v1/projects/p/locations/l/datasets/d/fhirStores/s`;
      const res = await fetch(`${proxyBaseUrl}/fhir/Patient/123?_count=10`, {
        headers: {
          'X-Store-Base': storeBase,
          'Authorization': 'Bearer test-token',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.receivedPath).toBe(
        '/v1/projects/p/locations/l/datasets/d/fhirStores/s/fhir/Patient/123?_count=10'
      );
      expect(body.receivedAuth).toBe('Bearer test-token');
    } finally {
      mockBackend.stop();
    }
  });

  it('rewrites _cursor to _page_token for GCP pagination', async () => {
    const mockBackend = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        return Response.json({ receivedPath: url.pathname + url.search });
      },
    });

    try {
      const storeBase = `http://localhost:${mockBackend.port}/v1/projects/p/locations/l/datasets/d/fhirStores/s`;
      const res = await fetch(`${proxyBaseUrl}/fhir/Patient?_cursor=abc123&_count=20`, {
        headers: { 'X-Store-Base': storeBase },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.receivedPath).toContain('_page_token=abc123');
      expect(body.receivedPath).not.toContain('_cursor=');
    } finally {
      mockBackend.stop();
    }
  });

  it('forwards response status and headers from upstream', async () => {
    const mockBackend = Bun.serve({
      port: 0,
      fetch() {
        return new Response('Not Found', {
          status: 404,
          headers: { 'Content-Type': 'application/fhir+json' },
        });
      },
    });

    try {
      const storeBase = `http://localhost:${mockBackend.port}/v1/stores/s`;
      const res = await fetch(`${proxyBaseUrl}/fhir/Patient/missing`, {
        headers: { 'X-Store-Base': storeBase },
      });

      expect(res.status).toBe(404);
      expect(res.headers.get('Content-Type')).toContain('application/fhir+json');
    } finally {
      mockBackend.stop();
    }
  });
});

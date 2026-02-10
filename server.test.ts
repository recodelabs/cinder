// ABOUTME: Tests for the Bun production server.
// ABOUTME: Verifies static file serving, SPA fallback, and FHIR proxy routing.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { createServer } from './server';

const TEST_DIST = './dist-test';
let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  // Create a fake dist directory with test files
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

describe('static file serving', () => {
  it('serves index.html at root', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SPA');
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

describe('FHIR proxy', () => {
  it('returns 400 when X-Store-Base header is missing', async () => {
    const res = await fetch(`${baseUrl}/fhir/Patient/123`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('X-Store-Base');
  });

  it('proxies requests to the store base URL', async () => {
    // Use a mock HTTP server to verify the proxy forwards correctly
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
      const res = await fetch(`${baseUrl}/fhir/Patient/123?_count=10`, {
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
      const res = await fetch(`${baseUrl}/fhir/Patient/missing`, {
        headers: { 'X-Store-Base': storeBase },
      });

      expect(res.status).toBe(404);
      expect(res.headers.get('Content-Type')).toContain('application/fhir+json');
    } finally {
      mockBackend.stop();
    }
  });
});

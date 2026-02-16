// ABOUTME: Bun production server for the Cinder SPA.
// ABOUTME: Serves static files from dist/ with gzip compression, proxies /fhir/* using X-Store-Base header.
import { existsSync, statSync } from 'fs';
import { gzipSync } from 'bun';
import { extname, join, resolve } from 'path';

const HEALTHCARE_API_PATTERN =
  /^https:\/\/healthcare\.googleapis\.com\/v1\/projects\/[\w-]+\/locations\/[\w-]+\/datasets\/[\w-]+\/fhirStores\/[\w-]+$/;

export function isValidStoreBase(storeBase: string): boolean {
  return HEALTHCARE_API_PATTERN.test(storeBase);
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com",
    "connect-src 'self' https://healthcare.googleapis.com https://tx.fhir.org https://oauth2.googleapis.com https://accounts.google.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const COMPRESSIBLE_EXTENSIONS = new Set(['.js', '.css', '.html', '.json', '.svg', '.xml', '.txt']);

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function acceptsGzip(req: Request): boolean {
  return (req.headers.get('Accept-Encoding') ?? '').includes('gzip');
}

function isHashedAsset(pathname: string): boolean {
  return pathname.startsWith('/assets/');
}

async function serveStaticFile(req: Request, filePath: string): Promise<Response> {
  const ext = extname(filePath);
  const contentType = CONTENT_TYPES[ext];
  const headers = new Headers();
  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  if (isHashedAsset(new URL(req.url).pathname)) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }

  if (COMPRESSIBLE_EXTENSIONS.has(ext) && acceptsGzip(req)) {
    const raw = await Bun.file(filePath).arrayBuffer();
    const compressed = gzipSync(new Uint8Array(raw));
    headers.set('Content-Encoding', 'gzip');
    return new Response(compressed, { headers });
  }

  return new Response(Bun.file(filePath), { headers });
}

interface ServerOptions {
  port?: number;
  distDir?: string;
  validateStoreBase?: (url: string) => boolean;
}

export function createServer(options: ServerOptions = {}) {
  const port = options.port ?? (process.env.PORT ? Number(process.env.PORT) : 3000);
  const distDir = options.distDir ?? './dist';
  const validateStore = options.validateStoreBase ?? isValidStoreBase;

  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // FHIR proxy
      if (url.pathname.startsWith('/fhir')) {
        return withSecurityHeaders(await handleFhirProxy(req, url, validateStore));
      }

      // Static file serving with path traversal protection
      const resolvedDist = resolve(distDir);
      const filePath = resolve(distDir, '.' + url.pathname);
      if (url.pathname !== '/' && filePath.startsWith(resolvedDist) && existsSync(filePath) && statSync(filePath).isFile()) {
        return withSecurityHeaders(await serveStaticFile(req, filePath));
      }

      // SPA fallback
      return withSecurityHeaders(await serveStaticFile(req, join(distDir, 'index.html')));
    },
  });
}

async function handleFhirProxy(req: Request, url: URL, validateStore: (url: string) => boolean): Promise<Response> {
  const storeBase = req.headers.get('X-Store-Base');
  if (!storeBase || !validateStore(storeBase)) {
    return Response.json(
      { error: 'X-Store-Base header must be a valid GCP Healthcare API FHIR store URL' },
      { status: 400 }
    );
  }

  const targetUrl = `${storeBase}${url.pathname}${url.search.replace(/_cursor=/g, '_page_token=')}`;

  const headers = new Headers();
  const auth = req.headers.get('Authorization');
  if (auth) {
    headers.set('Authorization', auth);
  }
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
  // Bun's fetch auto-decompresses gzip responses but keeps the original headers.
  // Strip encoding headers so the browser doesn't try to decompress again.
  responseHeaders.delete('Content-Encoding');
  responseHeaders.delete('Content-Length');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

// Start server when run directly
if (import.meta.main) {
  const server = createServer();
  console.log(`Cinder server listening on port ${server.port}`);
}

// ABOUTME: Bun production server for the Cinder SPA.
// ABOUTME: Serves static files from dist/, proxies /fhir/* using X-Store-Base header.
import { existsSync } from 'fs';
import { join, resolve } from 'path';

const HEALTHCARE_API_PATTERN =
  /^https:\/\/healthcare\.googleapis\.com\/v1\/projects\/[\w-]+\/locations\/[\w-]+\/datasets\/[\w-]+\/fhirStores\/[\w-]+$/;

export function isValidStoreBase(storeBase: string): boolean {
  return HEALTHCARE_API_PATTERN.test(storeBase);
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
        return handleFhirProxy(req, url, validateStore);
      }

      // Static file serving with path traversal protection
      const resolvedDist = resolve(distDir);
      const filePath = resolve(distDir, '.' + url.pathname);
      if (url.pathname !== '/' && filePath.startsWith(resolvedDist) && existsSync(filePath)) {
        return new Response(Bun.file(filePath));
      }

      // SPA fallback
      return new Response(Bun.file(join(distDir, 'index.html')));
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

  const targetUrl = `${storeBase}${url.pathname}${url.search}`;

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

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

// Start server when run directly
if (import.meta.main) {
  const server = createServer();
  console.log(`Cinder server listening on port ${server.port}`);
}

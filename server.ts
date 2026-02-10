// ABOUTME: Bun production server for the Cinder SPA.
// ABOUTME: Serves static files from dist/, proxies /fhir/* using X-Store-Base header.
import { existsSync } from 'fs';
import { join } from 'path';

interface ServerOptions {
  port?: number;
  distDir?: string;
}

export function createServer(options: ServerOptions = {}) {
  const port = options.port ?? Number(process.env.PORT) ?? 3000;
  const distDir = options.distDir ?? './dist';

  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // FHIR proxy
      if (url.pathname.startsWith('/fhir')) {
        return handleFhirProxy(req, url);
      }

      // Static file serving
      const filePath = join(distDir, url.pathname);
      if (url.pathname !== '/' && existsSync(filePath)) {
        return new Response(Bun.file(filePath));
      }

      // SPA fallback
      return new Response(Bun.file(join(distDir, 'index.html')));
    },
  });
}

async function handleFhirProxy(req: Request, url: URL): Promise<Response> {
  const storeBase = req.headers.get('X-Store-Base');
  if (!storeBase) {
    return Response.json(
      { error: 'X-Store-Base header is required for FHIR proxy requests' },
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

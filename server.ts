// ABOUTME: Bun production server for the Cinder SPA.
// ABOUTME: Serves static files, proxies /fhir/* using org service accounts, handles auth/org/project API routes.
import { existsSync, statSync } from 'fs';
import { gzipSync } from 'bun';
import { extname, join, resolve } from 'path';
import { eq } from 'drizzle-orm';

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self' https://healthcare.googleapis.com https://tx.fhir.org",
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
}

export function createServer(options: ServerOptions = {}) {
  const port = options.port ?? (process.env.PORT ? Number(process.env.PORT) : 3000);
  const distDir = options.distDir ?? './dist';

  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // Better Auth handles all /api/auth/* routes
      if (url.pathname.startsWith('/api/auth')) {
        const { auth } = await import('./server/auth');
        const response = auth.handler(req);
        return withSecurityHeaders(await response);
      }

      // Credential routes
      if (url.pathname.match(/^\/api\/orgs\/[\w-]+\/credential$/) && req.method === 'PUT') {
        const orgId = url.pathname.split('/')[3]!;
        const { handlePutCredential } = await import('./server/routes/credentials');
        return withSecurityHeaders(await handlePutCredential(req, orgId));
      }
      if (url.pathname.match(/^\/api\/orgs\/[\w-]+\/credential$/) && req.method === 'GET') {
        const orgId = url.pathname.split('/')[3]!;
        const { handleGetCredentialStatus } = await import('./server/routes/credentials');
        return withSecurityHeaders(await handleGetCredentialStatus(req, orgId));
      }

      // Project routes (org-scoped)
      if (url.pathname.match(/^\/api\/orgs\/[\w-]+\/projects$/) && req.method === 'GET') {
        const orgId = url.pathname.split('/')[3]!;
        const { handleListProjects } = await import('./server/routes/projects');
        return withSecurityHeaders(await handleListProjects(req, orgId));
      }
      if (url.pathname.match(/^\/api\/orgs\/[\w-]+\/projects$/) && req.method === 'POST') {
        const orgId = url.pathname.split('/')[3]!;
        const { handleCreateProject } = await import('./server/routes/projects');
        return withSecurityHeaders(await handleCreateProject(req, orgId));
      }

      // Project routes (by project ID)
      if (url.pathname.match(/^\/api\/projects\/[\w-]+$/) && req.method === 'GET') {
        const projectId = url.pathname.split('/')[3]!;
        const { handleGetProject } = await import('./server/routes/projects');
        return withSecurityHeaders(await handleGetProject(req, projectId));
      }
      if (url.pathname.match(/^\/api\/projects\/[\w-]+$/) && req.method === 'PATCH') {
        const projectId = url.pathname.split('/')[3]!;
        const { handleUpdateProject } = await import('./server/routes/projects');
        return withSecurityHeaders(await handleUpdateProject(req, projectId));
      }
      if (url.pathname.match(/^\/api\/projects\/[\w-]+$/) && req.method === 'DELETE') {
        const projectId = url.pathname.split('/')[3]!;
        const { handleDeleteProject } = await import('./server/routes/projects');
        return withSecurityHeaders(await handleDeleteProject(req, projectId));
      }

      // Member routes
      if (url.pathname.match(/^\/api\/orgs\/[\w-]+\/members$/) && req.method === 'POST') {
        const orgId = url.pathname.split('/')[3]!;
        const { handleDirectAddMember } = await import('./server/routes/members');
        return withSecurityHeaders(await handleDirectAddMember(req, orgId));
      }
      if (url.pathname.match(/^\/api\/orgs\/[\w-]+\/members\/[\w-]+$/) && req.method === 'DELETE') {
        const orgId = url.pathname.split('/')[3]!;
        const userId = url.pathname.split('/')[5]!;
        const { handleRemoveMember } = await import('./server/routes/members');
        return withSecurityHeaders(await handleRemoveMember(req, orgId, userId));
      }

      // Org deletion (with token cache cleanup)
      if (url.pathname.match(/^\/api\/orgs\/[\w-]+$/) && req.method === 'DELETE') {
        const orgId = url.pathname.split('/')[3]!;
        const { requireOrgOwner } = await import('./server/middleware');
        try {
          await requireOrgOwner(req, orgId);
        } catch (err) {
          if (err instanceof Response) return withSecurityHeaders(err);
          throw err;
        }
        const { tokenCache } = await import('./server/routes/shared');
        tokenCache.evict(orgId);
        // Delegate to Better Auth for the actual org deletion
        const { auth } = await import('./server/auth');
        try {
          await auth.api.deleteOrganization({
            body: { organizationId: orgId },
            headers: req.headers,
          });
          return withSecurityHeaders(new Response(null, { status: 204 }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to delete organization';
          return withSecurityHeaders(Response.json({ error: message }, { status: 400 }));
        }
      }

      // FHIR proxy
      if (url.pathname.startsWith('/fhir')) {
        return withSecurityHeaders(await handleFhirProxy(req, url));
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

async function handleFhirProxy(req: Request, url: URL): Promise<Response> {
  const projectId = req.headers.get('X-Project-Id');
  if (!projectId) {
    return Response.json(
      { error: 'X-Project-Id header is required' },
      { status: 400 },
    );
  }

  // Validate session
  const { getSession } = await import('./server/middleware');
  const session = await getSession(req);
  if (!session) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Look up project
  const { db } = await import('./server/db');
  const { project, orgCredential } = await import('./server/schema');
  const [proj] = await db.select().from(project).where(eq(project.id, projectId)).limit(1);
  if (!proj) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  // Verify org membership
  const { requireOrgMember } = await import('./server/middleware');
  try {
    await requireOrgMember(req, proj.organizationId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  // Determine org auth mode from Better Auth metadata
  const orgRows = await db.execute<{ metadata: string | null }>(
    (await import('drizzle-orm')).sql`SELECT metadata FROM organization WHERE id = ${proj.organizationId} LIMIT 1`
  );
  const orgMeta = orgRows[0]?.metadata ? JSON.parse(orgRows[0].metadata) as { authMode?: string } : {};
  const useUserToken = orgMeta.authMode === 'user_token';

  // Get or mint GCP access token
  const { tokenCache } = await import('./server/routes/shared');
  let gcpToken = useUserToken ? null : tokenCache.get(proj.organizationId);

  if (!gcpToken) {
    if (useUserToken) {
      // Use the signed-in user's own Google OAuth token
      const { getUserGoogleToken } = await import('./server/user-token');
      const token = await getUserGoogleToken(session.userId);
      if (!token) {
        return Response.json(
          { error: 'Your Google session has expired — please sign in again' },
          { status: 401 },
        );
      }
      gcpToken = token;
    } else {
      const [cred] = await db
        .select()
        .from(orgCredential)
        .where(eq(orgCredential.organizationId, proj.organizationId))
        .limit(1);

      if (!cred) {
        return Response.json(
          { error: 'Organization has no service account configured' },
          { status: 503 },
        );
      }

      try {
        const { decryptCredential, getMasterKey } = await import('./server/crypto');
        const masterKey = getMasterKey(cred.keyVersion);
        const serviceAccountJson = decryptCredential(cred, masterKey);

        const { mintGcpToken } = await import('./server/gcp-token');
        const token = await mintGcpToken(serviceAccountJson);
        tokenCache.set(proj.organizationId, token.accessToken, token.expiresInSeconds);
        gcpToken = token.accessToken;
      } catch (e) {
        console.error('Failed to mint GCP token:', e);
        tokenCache.evict(proj.organizationId);
        return Response.json(
          { error: 'Failed to authenticate to GCP — service account may be invalid or revoked' },
          { status: 502 },
        );
      }
    }
  }

  // Build target URL from project config
  const storeBaseUrl = `https://healthcare.googleapis.com/v1/projects/${proj.gcpProject}/locations/${proj.gcpLocation}/datasets/${proj.gcpDataset}/fhirStores/${proj.gcpFhirStore}`;
  const targetUrl = `${storeBaseUrl}${url.pathname}${url.search.replace(/_cursor=/g, '_page_token=')}`;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${gcpToken}`);
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
  try {
    const { ensureTables, ensureForeignKeys } = await import('./server/db');
    console.log('Ensuring database tables exist...');
    await ensureTables();
    console.log('Database tables ready.');

    // Better Auth creates its tables on first request, but we need
    // to ensure FK constraints exist after the organization table is created.
    // This is idempotent and safe to run even if the organization table
    // doesn't exist yet (the DO block checks for the constraint first).
    try {
      await ensureForeignKeys();
      console.log('Foreign key constraints ready.');
    } catch (err) {
      console.warn('Could not ensure foreign keys (organization table may not exist yet):', err);
    }
  } catch (err) {
    console.error('Database setup failed:', err);
    process.exit(1);
  }
  const server = createServer();
  console.log(`Cinder server listening on port ${server.port}`);
}

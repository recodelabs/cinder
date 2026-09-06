// ABOUTME: Pure helpers for proxying to generic FHIR servers (HAPI, etc.) that are not GCP Healthcare API.
// ABOUTME: Builds upstream URLs, encodes opaque page cursors, and rewrites Bundle links back to the proxy.

export type ServerType = 'gcp' | 'fhir';

/** Trims whitespace and trailing slashes so joins with request paths are predictable. */
export function normalizeFhirBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/**
 * Generic FHIR targets are only allowed when their hostname appears in the
 * CINDER_ALLOWED_FHIR_HOSTS allowlist (comma-separated, or "*" for any host).
 * This keeps the hosted deployment from being used as an open proxy.
 */
export function isAllowedFhirHost(baseUrl: string, allowlist: string | undefined): boolean {
  if (!allowlist) return false;
  const entries = allowlist.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (entries.length === 0) return false;
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return entries.includes('*') || entries.includes(hostname);
}

/** Encodes an upstream paging query string as an opaque, URL-safe cursor. */
export function encodePageCursor(query: string): string {
  return Buffer.from(query, 'utf8').toString('base64url');
}

/** Decodes a cursor produced by encodePageCursor; returns undefined for malformed input. */
export function decodePageCursor(cursor: string): string | undefined {
  if (!cursor || !/^[A-Za-z0-9_-]+$/.test(cursor)) return undefined;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  // Only accept plain query strings — never a full URL or path.
  if (!decoded || decoded.includes('://') || decoded.startsWith('/')) return undefined;
  return decoded;
}

/**
 * Maps an incoming proxy request (/fhir/Patient?...) to the upstream URL.
 * If the request carries a _cursor or _page_token, the cursor is decoded and the
 * paging request is issued at the server base, which is where HAPI serves pages.
 */
export function buildFhirTargetUrl(baseUrl: string, pathname: string, search: string): string {
  const base = normalizeFhirBaseUrl(baseUrl);
  const params = new URLSearchParams(search);
  const cursor = params.get('_cursor') ?? params.get('_page_token');
  if (cursor) {
    const query = decodePageCursor(cursor);
    if (query) {
      return `${base}?${query}`;
    }
  }
  const rest = pathname.replace(/^\/fhir(?=\/|$)/, '');
  return `${base}${rest}${search}`;
}

/** Strips the /fhir prefix, leaving e.g. "/Patient" or "" for the base. */
export function resourcePathFromProxyPath(pathname: string): string {
  return pathname.replace(/^\/fhir(?=\/|$)/, '').replace(/\/+$/, '');
}

interface BundleLink {
  relation?: string;
  url?: string;
}

/**
 * Rewrites Bundle.link URLs that point at the upstream server so they point at the proxy.
 * The "next" link is converted to the _page_token form the client already understands
 * for GCP, carrying the upstream paging query as an opaque cursor.
 */
export function rewriteBundleLinks<T>(body: T, baseUrl: string, proxyFhirBase: string, resourcePath: string): T {
  if (!body || typeof body !== 'object') return body;
  const bundle = body as { resourceType?: string; link?: BundleLink[] };
  if (bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.link)) return body;

  const base = normalizeFhirBaseUrl(baseUrl);
  const links = bundle.link.map((link) => {
    if (!link.url || !link.url.startsWith(base)) return link;
    if (link.relation === 'next') {
      const query = link.url.slice(link.url.indexOf('?') + 1);
      if (link.url.includes('?') && query) {
        return { ...link, url: `${proxyFhirBase}${resourcePath}?_page_token=${encodePageCursor(query)}` };
      }
    }
    return { ...link, url: `${proxyFhirBase}${link.url.slice(base.length)}` };
  });
  return { ...bundle, link: links } as T;
}

/** Rewrites an absolute upstream URL (e.g. a Location header) to the proxy base. */
export function rewriteUpstreamUrl(value: string, baseUrl: string, proxyFhirBase: string): string {
  const base = normalizeFhirBaseUrl(baseUrl);
  return value.startsWith(base) ? `${proxyFhirBase}${value.slice(base.length)}` : value;
}

// ABOUTME: Forwards /fhir/* requests to a generic FHIR server project (HAPI, FHIR Info Gateway, etc.).
// ABOUTME: Applies the host allowlist, optional client-credentials auth with one refresh on 401, and paging link rewrites.
import type { ClientCredentials, ClientCredentialsTokens } from './fhir-auth';
import { TokenRequestError } from './fhir-auth';
import {
  buildFhirTargetUrl,
  isAllowedFhirHost,
  resourcePathFromProxyPath,
  rewriteBundleLinks,
  rewriteUpstreamUrl,
} from './fhir-target';

export interface FhirServerTarget {
  readonly baseUrl: string;
  /** Client credentials for servers that need a Bearer token; tokens are cached under authKey. */
  readonly auth?: ClientCredentials & { readonly authKey: string };
}

export interface FhirProxyOptions {
  /** CINDER_ALLOWED_FHIR_HOSTS; applies to both the FHIR base URL and the token URL. */
  readonly allowedHosts: string | undefined;
  readonly tokens: ClientCredentialsTokens;
}

const FORWARDED_REQUEST_HEADERS = ['Content-Type', 'Accept', 'Prefer', 'If-Match', 'If-None-Match', 'If-None-Exist'];

function securityOutcome(status: number, text: string): Response {
  return Response.json(
    {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'security', diagnostics: text }],
    },
    { status, headers: { 'Content-Type': 'application/fhir+json' } },
  );
}

/**
 * Proxies a request to a plain FHIR server. Paging is translated so the browser
 * keeps using the same _cursor/_page_token contract it uses for GCP: HAPI-style
 * "next" links are folded into an opaque cursor, and cursor requests are replayed
 * at the server base URL.
 */
export async function proxyToFhirServer(
  req: Request,
  url: URL,
  target: FhirServerTarget,
  options: FhirProxyOptions,
): Promise<Response> {
  const { baseUrl: fhirBaseUrl, auth } = target;
  if (!isAllowedFhirHost(fhirBaseUrl, options.allowedHosts)) {
    return Response.json(
      { error: 'This FHIR server host is not allowed. Add its hostname to CINDER_ALLOWED_FHIR_HOSTS on the server.' },
      { status: 503 },
    );
  }
  if (auth && !isAllowedFhirHost(auth.tokenUrl, options.allowedHosts)) {
    return Response.json(
      { error: 'This token URL host is not allowed. Add its hostname to CINDER_ALLOWED_FHIR_HOSTS on the server.' },
      { status: 503 },
    );
  }

  const targetUrl = buildFhirTargetUrl(fhirBaseUrl, url.pathname, url.search);
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/fhir+json');
  }
  // Buffered so the request can be replayed after a token refresh.
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();

  const send = async (forceNewToken: boolean): Promise<Response> => {
    if (auth) {
      if (forceNewToken) options.tokens.evict(auth.authKey);
      headers.set('Authorization', `Bearer ${await options.tokens.get(auth.authKey, auth)}`);
    }
    return fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      // Don't let a redirect carry the Bearer token to another host.
      redirect: auth ? 'manual' : 'follow',
    });
  };

  let upstream: Response;
  try {
    upstream = await send(false);
    if (upstream.status === 401 && auth) {
      // The cached token may have been revoked or expired early; try once with a fresh one.
      await upstream.body?.cancel();
      upstream = await send(true);
    }
  } catch (err) {
    if (err instanceof TokenRequestError) {
      // A 4xx from the token endpoint means bad credentials, which retrying won't fix.
      const status = err.status !== undefined && err.status < 500 ? 403 : 502;
      return securityOutcome(status, `Could not get an access token for this FHIR server. ${err.message}.`);
    }
    throw err;
  }

  // Passing a 401 through would make the browser sign the user out of Cinder, and a 5xx
  // would make it retry; 403 does neither.
  if (upstream.status === 401) {
    await upstream.body?.cancel();
    return securityOutcome(
      403,
      auth
        ? 'The FHIR server rejected the access token (401). Check the project\'s client ID and secret.'
        : 'The FHIR server requires authentication (401). Add client credentials to the project.',
    );
  }

  const proxyFhirBase = `${url.origin}/fhir`;
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('Content-Encoding');
  responseHeaders.delete('Content-Length');
  for (const name of ['Location', 'Content-Location']) {
    const value = responseHeaders.get(name);
    if (value) responseHeaders.set(name, rewriteUpstreamUrl(value, fhirBaseUrl, proxyFhirBase));
  }

  const contentType = upstream.headers.get('Content-Type') ?? '';
  if (!contentType.includes('json')) {
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  }

  // Bundles carry absolute upstream links; point them back at this proxy.
  const text = await upstream.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(text, { status: upstream.status, headers: responseHeaders });
  }
  const rewritten = rewriteBundleLinks(parsed, fhirBaseUrl, proxyFhirBase, resourcePathFromProxyPath(url.pathname));
  return new Response(JSON.stringify(rewritten), { status: upstream.status, headers: responseHeaders });
}

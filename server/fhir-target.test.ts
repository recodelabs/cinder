// ABOUTME: Unit tests for generic FHIR proxy helpers.
// ABOUTME: Covers URL building, page cursor round-trips, Bundle link rewriting, and the host allowlist.
import { describe, expect, it } from 'vitest';
import {
  buildFhirTargetUrl,
  decodePageCursor,
  encodePageCursor,
  isAllowedFhirHost,
  normalizeFhirBaseUrl,
  resourcePathFromProxyPath,
  rewriteBundleLinks,
  rewriteUpstreamUrl,
} from './fhir-target';

const BASE = 'http://localhost:3447/fhir';
const PROXY = 'http://localhost:3000/fhir';

describe('normalizeFhirBaseUrl', () => {
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeFhirBaseUrl(' http://localhost:3447/fhir/ ')).toBe(BASE);
    expect(normalizeFhirBaseUrl('http://localhost:3447/fhir//')).toBe(BASE);
  });
});

describe('isAllowedFhirHost', () => {
  it('rejects everything when no allowlist is configured', () => {
    expect(isAllowedFhirHost(BASE, undefined)).toBe(false);
    expect(isAllowedFhirHost(BASE, '')).toBe(false);
  });

  it('matches hostnames case-insensitively from a comma-separated list', () => {
    expect(isAllowedFhirHost(BASE, 'LOCALHOST, hapi.example.org')).toBe(true);
    expect(isAllowedFhirHost('https://hapi.example.org/fhir', 'localhost,hapi.example.org')).toBe(true);
    expect(isAllowedFhirHost('https://evil.example.org/fhir', 'localhost')).toBe(false);
  });

  it('allows any host with a wildcard', () => {
    expect(isAllowedFhirHost('https://anything.example.org/fhir', '*')).toBe(true);
  });

  it('rejects unparseable base URLs', () => {
    expect(isAllowedFhirHost('not a url', '*')).toBe(false);
  });
});

describe('page cursors', () => {
  const query = '_getpages=167c59f7&_getpagesoffset=2&_count=2&_bundletype=searchset';

  it('round-trips a query string', () => {
    const cursor = encodePageCursor(query);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePageCursor(cursor)).toBe(query);
  });

  it('rejects malformed or unsafe cursors', () => {
    expect(decodePageCursor('')).toBeUndefined();
    expect(decodePageCursor('not base64url!')).toBeUndefined();
    expect(decodePageCursor(encodePageCursor('http://evil.example.org/x'))).toBeUndefined();
    expect(decodePageCursor(encodePageCursor('/etc/passwd'))).toBeUndefined();
  });
});

describe('buildFhirTargetUrl', () => {
  it('maps resource paths and query strings onto the base URL', () => {
    expect(buildFhirTargetUrl(BASE, '/fhir/Patient', '?_count=20&name=bob')).toBe(
      `${BASE}/Patient?_count=20&name=bob`
    );
    expect(buildFhirTargetUrl(`${BASE}/`, '/fhir/Patient/123', '')).toBe(`${BASE}/Patient/123`);
    expect(buildFhirTargetUrl(BASE, '/fhir/metadata', '')).toBe(`${BASE}/metadata`);
    expect(buildFhirTargetUrl(BASE, '/fhir', '')).toBe(BASE);
  });

  it('does not treat /fhirstore as the proxy prefix', () => {
    expect(buildFhirTargetUrl(BASE, '/fhirstore', '')).toBe(`${BASE}/fhirstore`);
  });

  it('issues cursor requests at the server base with the decoded query', () => {
    const query = '_getpages=abc&_getpagesoffset=20&_count=20&_bundletype=searchset';
    const cursor = encodePageCursor(query);
    expect(buildFhirTargetUrl(BASE, '/fhir/Patient', `?_count=20&_cursor=${cursor}`)).toBe(`${BASE}?${query}`);
    expect(buildFhirTargetUrl(BASE, '/fhir/Patient', `?_page_token=${cursor}`)).toBe(`${BASE}?${query}`);
  });

  it('falls back to a normal search when the cursor is malformed', () => {
    expect(buildFhirTargetUrl(BASE, '/fhir/Patient', '?_cursor=!!!')).toBe(`${BASE}/Patient?_cursor=!!!`);
  });
});

describe('resourcePathFromProxyPath', () => {
  it('strips the proxy prefix', () => {
    expect(resourcePathFromProxyPath('/fhir/Location')).toBe('/Location');
    expect(resourcePathFromProxyPath('/fhir/Location/')).toBe('/Location');
    expect(resourcePathFromProxyPath('/fhir')).toBe('');
  });
});

describe('rewriteBundleLinks', () => {
  const bundle = {
    resourceType: 'Bundle',
    type: 'searchset',
    link: [
      { relation: 'self', url: `${BASE}/Location?_count=2` },
      { relation: 'next', url: `${BASE}?_getpages=abc&_getpagesoffset=2&_count=2&_bundletype=searchset` },
      { relation: 'previous', url: `${BASE}?_getpages=abc&_getpagesoffset=0&_count=2&_bundletype=searchset` },
      { relation: 'other', url: 'https://elsewhere.example.org/x' },
    ],
    entry: [],
  };

  it('rewrites upstream links to the proxy and turns next into a page token', () => {
    const result = rewriteBundleLinks(bundle, BASE, PROXY, '/Location');
    const byRel = Object.fromEntries(result.link.map((l) => [l.relation, l.url]));
    expect(byRel.self).toBe(`${PROXY}/Location?_count=2`);
    expect(byRel.previous).toBe(`${PROXY}?_getpages=abc&_getpagesoffset=0&_count=2&_bundletype=searchset`);
    expect(byRel.other).toBe('https://elsewhere.example.org/x');

    const next = new URL(byRel.next!);
    expect(next.origin + next.pathname).toBe(`${PROXY}/Location`);
    const token = next.searchParams.get('_page_token')!;
    expect(decodePageCursor(token)).toBe('_getpages=abc&_getpagesoffset=2&_count=2&_bundletype=searchset');
  });

  it('leaves the original bundle untouched', () => {
    rewriteBundleLinks(bundle, BASE, PROXY, '/Location');
    expect(bundle.link[1]!.url).toContain('_getpages');
  });

  it('passes through non-Bundle bodies unchanged', () => {
    const patient = { resourceType: 'Patient', id: '1' };
    expect(rewriteBundleLinks(patient, BASE, PROXY, '/Patient')).toBe(patient);
    expect(rewriteBundleLinks(null, BASE, PROXY, '')).toBeNull();
  });
});

describe('rewriteUpstreamUrl', () => {
  it('rewrites only URLs under the upstream base', () => {
    expect(rewriteUpstreamUrl(`${BASE}/Patient/1/_history/1`, BASE, PROXY)).toBe(`${PROXY}/Patient/1/_history/1`);
    expect(rewriteUpstreamUrl('https://elsewhere.example.org/x', BASE, PROXY)).toBe('https://elsewhere.example.org/x');
  });
});

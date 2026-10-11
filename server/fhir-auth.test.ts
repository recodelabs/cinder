// ABOUTME: Tests for OAuth2 client-credentials token requests and the per-project token store.
// ABOUTME: Runs a mock token endpoint with Bun.serve; covers caching, expiry, refresh, errors, and secret encryption.
import { afterAll, afterEach, beforeAll, describe, expect, it, setSystemTime } from 'bun:test';
import { randomBytes } from 'crypto';
import {
  cacheLifetimeSeconds,
  ClientCredentialsTokens,
  decryptClientSecret,
  encryptClientSecret,
  isSecureOrLoopbackUrl,
  requestClientCredentialsToken,
  TokenRequestError,
} from './fhir-auth';

const SECRET = 's3cret value&with=chars';

interface TokenRequest {
  readonly grantType: string | null;
  readonly clientId: string | null;
  readonly clientSecret: string | null;
}

let tokenServer: ReturnType<typeof Bun.serve>;
let tokenUrl: string;
let requests: TokenRequest[] = [];
let respond: (n: number) => Response = () => new Response('unset', { status: 500 });

beforeAll(() => {
  tokenServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/redirect') {
        return new Response(null, { status: 307, headers: { Location: `${tokenUrl}?redirected=1` } });
      }
      const form = new URLSearchParams(await req.text());
      requests.push({
        grantType: form.get('grant_type'),
        clientId: form.get('client_id'),
        clientSecret: form.get('client_secret'),
      });
      return respond(requests.length);
    },
  });
  tokenUrl = `http://127.0.0.1:${tokenServer.port}/realms/icr/protocol/openid-connect/token`;
});

afterAll(() => {
  tokenServer.stop(true);
});

afterEach(() => {
  requests = [];
  setSystemTime();
});

function tokenResponse(n: number, expiresIn = 3600): Response {
  return Response.json({ access_token: `token-${n}`, token_type: 'Bearer', expires_in: expiresIn });
}

const credentials = () => ({ tokenUrl, clientId: 'key-test', clientSecret: SECRET });

describe('requestClientCredentialsToken', () => {
  it('posts a form-encoded client-credentials grant', async () => {
    respond = (n) => tokenResponse(n);
    const token = await requestClientCredentialsToken(credentials());
    expect(token).toEqual({ accessToken: 'token-1', expiresInSeconds: 3600 });
    expect(requests).toEqual([{ grantType: 'client_credentials', clientId: 'key-test', clientSecret: SECRET }]);
  });

  it('reports the status and OAuth error code without the secret', async () => {
    respond = () => Response.json({ error: 'unauthorized_client', error_description: 'Invalid client' }, { status: 401 });
    const err = await requestClientCredentialsToken(credentials()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TokenRequestError);
    expect((err as TokenRequestError).status).toBe(401);
    expect((err as Error).message).toBe('Token endpoint returned 401 (unauthorized_client)');
    expect((err as Error).message).not.toContain(SECRET);
  });

  it('rejects a response without an access token', async () => {
    respond = () => Response.json({ token_type: 'Bearer' });
    await expect(requestClientCredentialsToken(credentials())).rejects.toThrow('no access_token');
  });

  it('rejects non-Bearer token types', async () => {
    respond = () => Response.json({ access_token: 'x', token_type: 'mac' });
    await expect(requestClientCredentialsToken(credentials())).rejects.toThrow('Unsupported token_type');
  });

  it('defaults expires_in when the server omits it', async () => {
    respond = () => Response.json({ access_token: 'x' });
    const token = await requestClientCredentialsToken(credentials());
    expect(token.expiresInSeconds).toBe(300);
  });

  it('does not follow redirects, so the secret cannot be replayed elsewhere', async () => {
    respond = (n) => tokenResponse(n);
    const redirecting = { ...credentials(), tokenUrl: `http://127.0.0.1:${tokenServer.port}/redirect` };
    await expect(requestClientCredentialsToken(redirecting)).rejects.toBeInstanceOf(TokenRequestError);
    expect(requests).toHaveLength(0);
  });

  it('wraps network failures', async () => {
    const unreachable = { ...credentials(), tokenUrl: 'http://127.0.0.1:9/token' };
    await expect(requestClientCredentialsToken(unreachable)).rejects.toBeInstanceOf(TokenRequestError);
  });
});

describe('ClientCredentialsTokens', () => {
  it('reuses a cached token until shortly before it expires', async () => {
    respond = (n) => tokenResponse(n, 3600);
    const tokens = new ClientCredentialsTokens();
    const start = new Date('2026-10-11T12:00:00Z');
    setSystemTime(start);

    expect(await tokens.get('project-a', credentials())).toBe('token-1');
    setSystemTime(new Date(start.getTime() + 3539_000));
    expect(await tokens.get('project-a', credentials())).toBe('token-1');
    setSystemTime(new Date(start.getTime() + 3540_000));
    expect(await tokens.get('project-a', credentials())).toBe('token-2');
    expect(requests).toHaveLength(2);
  });

  it('shares one token request between concurrent callers', async () => {
    respond = (n) => tokenResponse(n);
    const tokens = new ClientCredentialsTokens();
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => tokens.get('project-a', credentials())));
    expect(new Set(results)).toEqual(new Set(['token-1']));
    expect(requests).toHaveLength(1);
  });

  it('keeps tokens separate per project', async () => {
    respond = (n) => tokenResponse(n);
    const tokens = new ClientCredentialsTokens();
    expect(await tokens.get('project-a', credentials())).toBe('token-1');
    expect(await tokens.get('project-b', credentials())).toBe('token-2');
  });

  it('fetches a new token after evict', async () => {
    respond = (n) => tokenResponse(n);
    const tokens = new ClientCredentialsTokens();
    expect(await tokens.get('project-a', credentials())).toBe('token-1');
    tokens.evict('project-a');
    expect(await tokens.get('project-a', credentials())).toBe('token-2');
  });

  it('does not cache failures', async () => {
    respond = (n) => (n === 1 ? new Response('down', { status: 503 }) : tokenResponse(n));
    const tokens = new ClientCredentialsTokens();
    await expect(tokens.get('project-a', credentials())).rejects.toThrow('Token endpoint returned 503');
    expect(await tokens.get('project-a', credentials())).toBe('token-2');
  });
});

describe('cacheLifetimeSeconds', () => {
  it('renews one minute early for long-lived tokens and 10% early for short ones', () => {
    expect(cacheLifetimeSeconds(3600)).toBe(3540);
    expect(cacheLifetimeSeconds(300)).toBe(270);
    expect(cacheLifetimeSeconds(5)).toBe(5);
  });
});

describe('isSecureOrLoopbackUrl', () => {
  it('allows https anywhere and http only on loopback', () => {
    expect(isSecureOrLoopbackUrl('https://auth.healthcampaigns.org/realms/icr/protocol/openid-connect/token')).toBe(true);
    expect(isSecureOrLoopbackUrl('http://localhost:8080/token')).toBe(true);
    expect(isSecureOrLoopbackUrl('http://127.0.0.1:8080/token')).toBe(true);
    expect(isSecureOrLoopbackUrl('http://[::1]:8080/token')).toBe(true);
    expect(isSecureOrLoopbackUrl('http://auth.healthcampaigns.org/token')).toBe(false);
    expect(isSecureOrLoopbackUrl('http://localhost.evil.example/token')).toBe(false);
    expect(isSecureOrLoopbackUrl('not a url')).toBe(false);
  });
});

describe('client secret encryption', () => {
  it('round-trips through envelope encryption without storing the plaintext', () => {
    const masterKey = randomBytes(32).toString('base64');
    const encrypted = encryptClientSecret(SECRET, masterKey);
    expect(JSON.stringify(encrypted)).not.toContain(SECRET);
    expect(decryptClientSecret(encrypted, masterKey)).toBe(SECRET);
  });

  it('fails with the wrong master key', () => {
    const encrypted = encryptClientSecret(SECRET, randomBytes(32).toString('base64'));
    expect(() => decryptClientSecret(encrypted, randomBytes(32).toString('base64'))).toThrow();
  });
});

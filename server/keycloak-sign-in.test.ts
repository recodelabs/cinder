// ABOUTME: Tests for Keycloak sign-in configuration, the verified-email user lookup, and the sign-in options endpoint.
// ABOUTME: Runs a mock Keycloak userinfo endpoint with Bun.serve.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  fetchVerifiedKeycloakUser,
  handleSignInOptions,
  keycloakConfigFromEnv,
  keycloakProvider,
} from './keycloak-sign-in';

const ENV = {
  KEYCLOAK_ISSUER: 'https://auth.healthcampaigns.org/realms/icr/',
  KEYCLOAK_CLIENT_ID: 'cinder',
  KEYCLOAK_CLIENT_SECRET: 'client-secret',
  KEYCLOAK_LABEL: 'ICR',
};

describe('keycloakConfigFromEnv', () => {
  it('reads the issuer, client, secret, and label', () => {
    expect(keycloakConfigFromEnv(ENV)).toEqual({
      issuer: 'https://auth.healthcampaigns.org/realms/icr',
      clientId: 'cinder',
      clientSecret: 'client-secret',
      label: 'ICR',
    });
  });

  it('is off when nothing is set', () => {
    expect(keycloakConfigFromEnv({})).toBeUndefined();
  });

  it('is off when a setting is missing', () => {
    expect(keycloakConfigFromEnv({ ...ENV, KEYCLOAK_CLIENT_SECRET: undefined })).toBeUndefined();
  });

  it('requires https except on localhost', () => {
    expect(keycloakConfigFromEnv({ ...ENV, KEYCLOAK_ISSUER: 'http://auth.example.org/realms/icr' })).toBeUndefined();
    expect(keycloakConfigFromEnv({ ...ENV, KEYCLOAK_ISSUER: 'http://localhost:8180/realms/test' })?.issuer).toBe(
      'http://localhost:8180/realms/test',
    );
  });

  it('defaults the label', () => {
    expect(keycloakConfigFromEnv({ ...ENV, KEYCLOAK_LABEL: '' })?.label).toBe('Keycloak');
  });
});

describe('keycloakProvider', () => {
  it('uses OIDC discovery for the realm, PKCE, and the verified-email lookup', () => {
    const provider = keycloakProvider(keycloakConfigFromEnv(ENV)!);
    expect(provider.providerId).toBe('keycloak');
    expect(provider.discoveryUrl).toBe('https://auth.healthcampaigns.org/realms/icr/.well-known/openid-configuration');
    expect(provider.pkce).toBe(true);
    expect(provider.scopes).toEqual(['openid', 'profile', 'email']);
    expect(typeof provider.getUserInfo).toBe('function');
  });
});

describe('fetchVerifiedKeycloakUser', () => {
  let server: ReturnType<typeof Bun.serve>;
  let issuer: string;
  const profiles: Record<string, Record<string, unknown>> = {
    verified: { sub: 'u-1', email: 'amina@example.org', email_verified: true, name: 'Amina Bello' },
    unverified: { sub: 'u-2', email: 'tunde@example.org', email_verified: false, name: 'Tunde' },
    'no-email': { sub: 'u-3', email_verified: true, preferred_username: 'noemail' },
    'username-only': { sub: 'u-4', email: 'kemi@example.org', email_verified: true, preferred_username: 'kemi' },
  };

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname !== '/realms/test/protocol/openid-connect/userinfo') return new Response(null, { status: 404 });
        const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
        const profile = profiles[token];
        return profile ? Response.json(profile) : new Response(null, { status: 401 });
      },
    });
    issuer = `http://localhost:${server.port}/realms/test`;
  });

  afterAll(() => {
    server.stop(true);
  });

  const tokens = (accessToken: string) => ({ accessToken });

  it('returns the user when Keycloak has verified the email', async () => {
    expect(await fetchVerifiedKeycloakUser(tokens('verified'), issuer)).toEqual({
      id: 'u-1',
      email: 'amina@example.org',
      emailVerified: true,
      name: 'Amina Bello',
    });
  });

  it('refuses an unverified email', async () => {
    expect(await fetchVerifiedKeycloakUser(tokens('unverified'), issuer)).toBeNull();
  });

  it('refuses a user without an email', async () => {
    expect(await fetchVerifiedKeycloakUser(tokens('no-email'), issuer)).toBeNull();
  });

  it('falls back to the username for the display name', async () => {
    expect((await fetchVerifiedKeycloakUser(tokens('username-only'), issuer))?.name).toBe('kemi');
  });

  it('returns null when Keycloak rejects the token', async () => {
    expect(await fetchVerifiedKeycloakUser(tokens('expired'), issuer)).toBeNull();
    expect(await fetchVerifiedKeycloakUser({}, issuer)).toBeNull();
  });
});

describe('handleSignInOptions', () => {
  it('reports the Keycloak button without the client secret', async () => {
    const res = handleSignInOptions(keycloakConfigFromEnv(ENV));
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ keycloak: { providerId: 'keycloak', label: 'ICR' } });
    expect(text).not.toContain('client-secret');
    expect(text).not.toContain('auth.healthcampaigns.org');
  });

  it('reports no Keycloak button when it is not configured', async () => {
    expect(await handleSignInOptions(undefined).json()).toEqual({ keycloak: null });
  });
});

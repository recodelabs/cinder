// ABOUTME: Optional Keycloak (OpenID Connect) sign-in alongside Google, configured with KEYCLOAK_* environment variables.
// ABOUTME: Builds the Better Auth generic-oauth provider, accepts only verified emails, and reports sign-in options to the page.
import type { GenericOAuthConfig } from 'better-auth/plugins/generic-oauth';
import { keycloak } from 'better-auth/plugins/generic-oauth';
import { isSecureOrLoopbackUrl } from './fhir-auth';

export const KEYCLOAK_PROVIDER_ID = 'keycloak';

export interface KeycloakSignInConfig {
  /** Realm URL, e.g. https://auth.healthcampaigns.org/realms/icr */
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Button text: "Sign in with <label>". */
  readonly label: string;
}

/** Reads KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET and KEYCLOAK_LABEL; undefined when not configured. */
export function keycloakConfigFromEnv(env: Record<string, string | undefined>): KeycloakSignInConfig | undefined {
  const issuer = env.KEYCLOAK_ISSUER?.trim().replace(/\/+$/, '');
  const clientId = env.KEYCLOAK_CLIENT_ID?.trim();
  const clientSecret = env.KEYCLOAK_CLIENT_SECRET;
  if (!issuer && !clientId && !clientSecret) return undefined;
  if (!issuer || !clientId || !clientSecret) {
    console.warn('Keycloak sign-in is off: set all of KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID and KEYCLOAK_CLIENT_SECRET');
    return undefined;
  }
  if (!isSecureOrLoopbackUrl(issuer)) {
    console.warn('Keycloak sign-in is off: KEYCLOAK_ISSUER must use https (http is only allowed for localhost)');
    return undefined;
  }
  return { issuer, clientId, clientSecret, label: env.KEYCLOAK_LABEL?.trim() || 'Keycloak' };
}

type UserInfoTokens = Parameters<NonNullable<GenericOAuthConfig['getUserInfo']>>[0];

/**
 * Reads the signed-in user from Keycloak's userinfo endpoint. Returns null (Better Auth then
 * refuses the sign-in) unless Keycloak marks the email as verified: Cinder links accounts,
 * accepts invitations, and adds org members by email, so an unverified email must not count.
 */
export async function fetchVerifiedKeycloakUser(tokens: UserInfoTokens, issuer: string) {
  if (!tokens.accessToken) return null;
  const response = await fetch(`${issuer}/protocol/openid-connect/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const profile = (await response.json()) as Record<string, unknown>;
  const { sub, email, email_verified: emailVerified, name, preferred_username: username } = profile;
  if (typeof sub !== 'string' || typeof email !== 'string' || emailVerified !== true) {
    return null;
  }
  return {
    id: sub,
    email,
    emailVerified: true,
    name: typeof name === 'string' && name ? name : typeof username === 'string' ? username : email,
  };
}

export function keycloakProvider(config: KeycloakSignInConfig): GenericOAuthConfig {
  return {
    ...keycloak({ issuer: config.issuer, clientId: config.clientId, clientSecret: config.clientSecret, pkce: true }),
    getUserInfo: (tokens) => fetchVerifiedKeycloakUser(tokens, config.issuer),
  };
}

export interface SignInOptions {
  readonly keycloak: { readonly providerId: string; readonly label: string } | null;
}

/** GET /api/sign-in-options: which extra sign-in buttons the page should show. Never includes secrets. */
export function handleSignInOptions(config: KeycloakSignInConfig | undefined): Response {
  const options: SignInOptions = {
    keycloak: config ? { providerId: KEYCLOAK_PROVIDER_ID, label: config.label } : null,
  };
  return Response.json(options);
}

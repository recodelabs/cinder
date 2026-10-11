// ABOUTME: OAuth2 client credentials for generic FHIR server projects (e.g. HAPI behind FHIR Info Gateway).
// ABOUTME: Encrypts stored client secrets, requests tokens from the token URL, and caches them per project until shortly before expiry.
import { decryptCredential, encryptCredential } from './crypto';
import { TokenCache } from './token-cache';

export interface ClientCredentials {
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AccessToken {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

/** Thrown when the token endpoint refuses or returns an unusable response. Never carries the secret. */
export class TokenRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'TokenRequestError';
  }
}

/** Envelope-encrypted client secret, as stored in the fhir_server_credential table. */
export interface EncryptedClientSecret {
  readonly encryptedClientSecret: string;
  readonly encryptedDek: string;
  readonly iv: string;
  readonly authTag: string;
  readonly dekIv: string;
  readonly dekAuthTag: string;
  readonly keyVersion: number;
}

export function encryptClientSecret(secret: string, masterKeyBase64: string): EncryptedClientSecret {
  const { encryptedServiceAccount, ...rest } = encryptCredential(secret, masterKeyBase64);
  return { encryptedClientSecret: encryptedServiceAccount, ...rest };
}

export function decryptClientSecret(stored: EncryptedClientSecret, masterKeyBase64: string): string {
  const { encryptedClientSecret, ...rest } = stored;
  return decryptCredential({ encryptedServiceAccount: encryptedClientSecret, ...rest }, masterKeyBase64);
}

/** Used when a token response omits expires_in (it is only RECOMMENDED by RFC 6749). */
const DEFAULT_EXPIRES_IN_SECONDS = 300;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Secrets and tokens must not cross the network in clear text, so token URLs (and FHIR
 * base URLs of authenticated projects) must be https unless they point at this machine.
 */
export function isSecureOrLoopbackUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/** How long to cache a token: renew up to 60 s early so a token never lapses mid-request. */
export function cacheLifetimeSeconds(expiresInSeconds: number): number {
  const margin = Math.min(60, Math.floor(expiresInSeconds / 10));
  return Math.max(0, expiresInSeconds - margin);
}

/** OAuth2 client-credentials grant (RFC 6749 §4.4) with the secret sent in the form body. */
export async function requestClientCredentialsToken(credentials: ClientCredentials): Promise<AccessToken> {
  let response: Response;
  try {
    response = await fetch(credentials.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
      // A redirect could replay the secret to a host that is not on the allowlist.
      redirect: 'error',
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new TokenRequestError(`Token request failed: ${reason}`);
  }

  const body = (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined;

  if (!response.ok) {
    const code = typeof body?.error === 'string' ? ` (${body.error})` : '';
    throw new TokenRequestError(`Token endpoint returned ${response.status}${code}`, response.status);
  }

  const accessToken = body?.access_token;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new TokenRequestError('Token endpoint response has no access_token');
  }
  const tokenType = body?.token_type;
  if (typeof tokenType === 'string' && tokenType.toLowerCase() !== 'bearer') {
    throw new TokenRequestError(`Unsupported token_type "${tokenType}"`);
  }
  const expiresIn = Number(body?.expires_in);

  return {
    accessToken,
    expiresInSeconds: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_EXPIRES_IN_SECONDS,
  };
}

/**
 * Per-project token store. Concurrent requests for the same project share one token
 * request, so a page that fires many FHIR calls at once triggers a single grant.
 */
export class ClientCredentialsTokens {
  private readonly cache = new TokenCache();
  private readonly pending = new Map<string, Promise<string>>();

  async get(key: string, credentials: ClientCredentials): Promise<string> {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const request = requestClientCredentialsToken(credentials)
      .then((token) => {
        this.cache.set(key, token.accessToken, cacheLifetimeSeconds(token.expiresInSeconds));
        return token.accessToken;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }

  evict(key: string): void {
    this.cache.evict(key);
  }
}

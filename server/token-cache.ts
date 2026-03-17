// ABOUTME: In-memory cache for GCP access tokens keyed by org ID.
// ABOUTME: Tokens are cached until near expiry to avoid redundant token minting.

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

export class TokenCache {
  private cache = new Map<string, CachedToken>();

  get(orgId: string): string | null {
    const entry = this.cache.get(orgId);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt - 60_000) {
      this.cache.delete(orgId);
      return null;
    }
    return entry.accessToken;
  }

  set(orgId: string, accessToken: string, expiresAt: number): void {
    this.cache.set(orgId, { accessToken, expiresAt });
  }

  evict(orgId: string): void {
    this.cache.delete(orgId);
  }
}

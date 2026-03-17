// ABOUTME: In-memory cache for GCP access tokens minted from service accounts.
// ABOUTME: Keyed by org ID, with configurable TTL and manual eviction for credential updates.

interface CacheEntry {
  readonly token: string;
  readonly expiresAt: number;
}

export class TokenCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(orgId: string): string | undefined {
    const entry = this.entries.get(orgId);
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(orgId);
      return undefined;
    }
    return entry.token;
  }

  set(orgId: string, token: string, ttlSeconds: number): void {
    this.entries.set(orgId, {
      token,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  evict(orgId: string): void {
    this.entries.delete(orgId);
  }
}

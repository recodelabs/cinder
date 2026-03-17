// ABOUTME: Tests for the in-memory GCP access token cache.
// ABOUTME: Verifies storage, retrieval, TTL expiration, and per-org eviction.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TokenCache } from './token-cache';

describe('TokenCache', () => {
  let cache: TokenCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new TokenCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for a missing key', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('stores and retrieves a token', () => {
    cache.set('org-1', 'token-abc', 3600);
    expect(cache.get('org-1')).toBe('token-abc');
  });

  it('expires tokens after TTL', () => {
    cache.set('org-1', 'token-abc', 60);
    expect(cache.get('org-1')).toBe('token-abc');

    vi.advanceTimersByTime(60 * 1000);
    expect(cache.get('org-1')).toBeUndefined();
  });

  it('evicts a specific org token', () => {
    cache.set('org-1', 'token-abc', 3600);
    cache.evict('org-1');
    expect(cache.get('org-1')).toBeUndefined();
  });

  it('does not affect other orgs on evict', () => {
    cache.set('org-1', 'token-abc', 3600);
    cache.set('org-2', 'token-def', 3600);
    cache.evict('org-1');
    expect(cache.get('org-1')).toBeUndefined();
    expect(cache.get('org-2')).toBe('token-def');
  });
});

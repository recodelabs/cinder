// ABOUTME: Tests for Google OAuth2 token management.
// ABOUTME: Verifies token storage, expiry detection, and sign-out.
import { describe, expect, it, beforeEach } from 'vitest';
import { TokenStore } from './google-auth';

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore();
  });

  it('starts with no token', () => {
    expect(store.getAccessToken()).toBeUndefined();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('stores a token', () => {
    store.setToken({ access_token: 'abc123', expires_in: 3600 });
    expect(store.getAccessToken()).toBe('abc123');
    expect(store.isAuthenticated()).toBe(true);
  });

  it('clears token on sign out', () => {
    store.setToken({ access_token: 'abc123', expires_in: 3600 });
    store.clear();
    expect(store.getAccessToken()).toBeUndefined();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('detects expired tokens', () => {
    store.setToken({ access_token: 'abc123', expires_in: -1 });
    expect(store.isAuthenticated()).toBe(false);
  });
});

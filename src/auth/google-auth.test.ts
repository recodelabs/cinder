// ABOUTME: Tests for Google OAuth2 token management.
// ABOUTME: Verifies token storage, expiry detection, sign-out, and sessionStorage persistence.
import { describe, expect, it, beforeEach } from 'vitest';
import { TokenStore } from './google-auth';

const STORAGE_KEY = 'cinder:oauth-token';

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    sessionStorage.clear();
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

  it('persists token to sessionStorage on setToken', () => {
    store.setToken({ access_token: 'persisted', expires_in: 3600 });
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.access_token).toBe('persisted');
    expect(parsed.expiresAt).toBeGreaterThan(Date.now());
  });

  it('hydrates from sessionStorage on construction', () => {
    const expiresAt = Date.now() + 3600 * 1000;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: 'hydrated', expiresAt }));
    const hydrated = new TokenStore();
    expect(hydrated.getAccessToken()).toBe('hydrated');
    expect(hydrated.isAuthenticated()).toBe(true);
  });

  it('ignores expired token in sessionStorage', () => {
    const expiresAt = Date.now() - 1000;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: 'old', expiresAt }));
    const hydrated = new TokenStore();
    expect(hydrated.getAccessToken()).toBeUndefined();
    expect(hydrated.isAuthenticated()).toBe(false);
  });

  it('removes sessionStorage entry on clear', () => {
    store.setToken({ access_token: 'temp', expires_in: 3600 });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeTruthy();
    store.clear();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

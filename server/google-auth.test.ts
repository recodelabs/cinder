// ABOUTME: Tests for Google token verification utility.
// ABOUTME: Verifies email extraction from Google access tokens.
import { describe, expect, it, afterEach } from 'bun:test';
import { getEmailFromToken } from './google-auth';

describe('getEmailFromToken', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns email when Google returns valid userinfo', async () => {
    globalThis.fetch = async (url: string | URL | Request) => {
      if (String(url).includes('googleapis.com/oauth2/v3/userinfo')) {
        return new Response(JSON.stringify({ email: 'user@example.com', email_verified: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url);
    };

    const email = await getEmailFromToken('valid-token');
    expect(email).toBe('user@example.com');
  });

  it('returns null when Google returns 401', async () => {
    globalThis.fetch = async (url: string | URL | Request) => {
      if (String(url).includes('googleapis.com/oauth2/v3/userinfo')) {
        return new Response('Unauthorized', { status: 401 });
      }
      return originalFetch(url);
    };

    const email = await getEmailFromToken('invalid-token');
    expect(email).toBeNull();
  });

  it('returns null when email is not verified', async () => {
    globalThis.fetch = async (url: string | URL | Request) => {
      if (String(url).includes('googleapis.com/oauth2/v3/userinfo')) {
        return new Response(JSON.stringify({ email: 'user@example.com', email_verified: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url);
    };

    const email = await getEmailFromToken('unverified-token');
    expect(email).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };

    const email = await getEmailFromToken('any-token');
    expect(email).toBeNull();
  });
});

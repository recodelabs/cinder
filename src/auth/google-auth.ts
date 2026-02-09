// ABOUTME: Manages Google OAuth2 access tokens for Healthcare API requests.
// ABOUTME: Handles token storage, expiry tracking, sessionStorage persistence, and the GIS token model flow.

export interface TokenResponse {
  access_token: string;
  expires_in: number;
}

const STORAGE_KEY = 'cinder:oauth-token';

export class TokenStore {
  private accessToken: string | undefined;
  private expiresAt: number | undefined;

  constructor() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { access_token, expiresAt } = JSON.parse(raw);
        if (expiresAt > Date.now()) {
          this.accessToken = access_token;
          this.expiresAt = expiresAt;
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // Ignore corrupted storage
    }
  }

  getAccessToken(): string | undefined {
    if (this.expiresAt && Date.now() >= this.expiresAt) {
      this.clear();
    }
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return this.getAccessToken() !== undefined;
  }

  setToken(response: TokenResponse): void {
    this.accessToken = response.access_token;
    this.expiresAt = Date.now() + response.expires_in * 1000;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      access_token: this.accessToken,
      expiresAt: this.expiresAt,
    }));
  }

  clear(): void {
    this.accessToken = undefined;
    this.expiresAt = undefined;
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

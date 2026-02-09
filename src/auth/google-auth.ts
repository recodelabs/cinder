// ABOUTME: Manages Google OAuth2 access tokens for Healthcare API requests.
// ABOUTME: Handles token storage, expiry tracking, and the GIS token model flow.

export interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export class TokenStore {
  private accessToken: string | undefined;
  private expiresAt: number | undefined;

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
  }

  clear(): void {
    this.accessToken = undefined;
    this.expiresAt = undefined;
  }
}

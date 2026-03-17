// ABOUTME: Mints GCP access tokens from service account JSON credentials.
// ABOUTME: Uses google-auth-library to create a JWT and exchange it for an access token.

import { GoogleAuth } from 'google-auth-library';

export interface GcpToken {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

export async function mintGcpToken(serviceAccountJson: string): Promise<GcpToken> {
  const credentials: unknown = JSON.parse(serviceAccountJson);
  const auth = new GoogleAuth({
    credentials: credentials as Record<string, string>,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (!tokenResponse.token) {
    throw new Error('Failed to mint GCP access token: no token returned');
  }

  return {
    accessToken: tokenResponse.token,
    expiresInSeconds: 3300, // 55 minutes for safety margin
  };
}

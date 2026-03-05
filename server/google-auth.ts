// ABOUTME: Verifies Google OAuth2 access tokens and extracts user email.
// ABOUTME: Calls Google's userinfo endpoint to validate tokens server-side.

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

interface GoogleUserInfo {
  email: string;
  email_verified: boolean;
}

export async function getEmailFromToken(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      return null;
    }
    const info: GoogleUserInfo = await response.json();
    if (!info.email || !info.email_verified) {
      return null;
    }
    return info.email;
  } catch {
    return null;
  }
}

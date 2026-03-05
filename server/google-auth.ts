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
      const body = await response.text();
      console.error(`Google userinfo failed: ${response.status} ${body}`);
      return null;
    }
    const info: GoogleUserInfo = await response.json();
    if (!info.email || !info.email_verified) {
      console.error('Google userinfo missing email or not verified:', info);
      return null;
    }
    return info.email;
  } catch (err) {
    console.error('Google userinfo fetch error:', err);
    return null;
  }
}

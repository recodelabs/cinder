// ABOUTME: Retrieves and refreshes the signed-in user's Google OAuth access token.
// ABOUTME: Used for orgs in user_token auth mode, where FHIR calls use personal credentials.
import { OAuth2Client } from 'google-auth-library';
import { sql } from 'drizzle-orm';
import { db } from './db';

interface AccountRow {
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: Date | null;
}

export async function getUserGoogleToken(userId: string): Promise<string | null> {
  const rows = await db.execute<AccountRow>(sql`
    SELECT access_token, refresh_token, access_token_expires_at
    FROM account
    WHERE user_id = ${userId} AND provider_id = 'google'
    LIMIT 1
  `);

  const account = rows[0];
  if (!account?.access_token) return null;

  const expiresAt = account.access_token_expires_at
    ? new Date(account.access_token_expires_at)
    : null;

  // Token still valid
  if (!expiresAt || expiresAt > new Date()) {
    return account.access_token;
  }

  // Try to refresh
  if (!account.refresh_token) return null;

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  client.setCredentials({ refresh_token: account.refresh_token });

  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) return null;

  const newExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : null;
  await db.execute(sql`
    UPDATE account
    SET access_token = ${credentials.access_token},
        access_token_expires_at = ${newExpiry}
    WHERE user_id = ${userId} AND provider_id = 'google'
  `);

  return credentials.access_token;
}

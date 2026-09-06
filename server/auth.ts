// ABOUTME: Better Auth server instance with Google social login, optional dev email/password login, and organization plugin.
// ABOUTME: Manages user sessions, org membership, and invitations.

import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sql } from 'drizzle-orm';
import { authDb, db } from './db';
import * as authSchema from './auth-schema';

/**
 * Local development can sign in with email/password instead of Google.
 * Enabled only by CINDER_DEV_AUTH=true and never in production.
 */
export const devAuthEnabled = process.env.CINDER_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production';
if (process.env.CINDER_DEV_AUTH === 'true' && !devAuthEnabled) {
  console.warn('CINDER_DEV_AUTH is ignored when NODE_ENV=production');
}
if (devAuthEnabled) {
  console.warn('Dev email/password sign-in is enabled (CINDER_DEV_AUTH=true) — do not use in production');
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!googleClientId && !devAuthEnabled) {
  console.warn('GOOGLE_CLIENT_ID is not set and CINDER_DEV_AUTH is off — nobody will be able to sign in');
}

// Origins allowed to call the auth API. The Vite dev server (5173) proxies to the
// Bun server (3000), so its origin must be trusted for local development.
const trustedOrigins = [
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ...(devAuthEnabled ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : []),
];

export const auth = betterAuth({
  database: drizzleAdapter(authDb, { provider: 'pg', schema: authSchema }),
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  emailAndPassword: {
    enabled: devAuthEnabled,
  },
  socialProviders: googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          accessType: 'offline',
        },
      }
    : {},
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Auto-add user to orgs that have a pending invitation for their email
          try {
            const invitations = await db.execute<{ id: string; organization_id: string; role: string }>(
              sql`SELECT id, organization_id, role FROM "invitation"
                  WHERE email = ${user.email} AND status = 'pending'`
            );
            for (const inv of invitations) {
              const memberId = crypto.randomUUID();
              await db.execute(sql`
                INSERT INTO "member" (id, organization_id, user_id, role, created_at)
                VALUES (${memberId}, ${inv.organization_id}, ${user.id}, ${inv.role ?? 'member'}, NOW())
                ON CONFLICT DO NOTHING
              `);
              await db.execute(sql`
                UPDATE "invitation" SET status = 'accepted' WHERE id = ${inv.id}
              `);
            }
          } catch (err) {
            console.error('Failed to process pending invitations for new user:', err);
          }
        },
      },
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
    }),
  ],
});

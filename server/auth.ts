// ABOUTME: Better Auth server instance with Google social login and organization plugin.
// ABOUTME: Manages user sessions, org membership, and invitations.

import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sql } from 'drizzle-orm';
import { authDb, db } from './db';
import * as authSchema from './auth-schema';

export const auth = betterAuth({
  database: drizzleAdapter(authDb, { provider: 'pg', schema: authSchema }),
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      accessType: 'offline',
    },
  },
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

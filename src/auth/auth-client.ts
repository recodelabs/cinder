// ABOUTME: Better Auth React client with organization plugin.
// ABOUTME: Provides hooks for session, sign-in/out, and org management.
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

// ABOUTME: Better Auth React client with organization and generic OAuth (Keycloak) plugins.
// ABOUTME: Provides hooks for session, sign-in/out, and org management.
import { createAuthClient } from 'better-auth/react';
import { genericOAuthClient, organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [organizationClient(), genericOAuthClient()],
});

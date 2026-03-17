// ABOUTME: Better Auth server instance configuration.
// ABOUTME: Placeholder for the auth server used by middleware helpers.
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';

export const auth = betterAuth({
  plugins: [organization()],
});

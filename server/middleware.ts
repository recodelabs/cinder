// ABOUTME: Server middleware helpers for authentication and authorization.
// ABOUTME: Provides requireOrgOwner to gate routes to organization owners.

export async function requireOrgOwner(_req: Request, _orgId: string): Promise<void> {
  // TODO: Implement actual ownership check against Better Auth session + org membership
  // For now this is a placeholder that will be wired up when auth is integrated
  throw new Error('requireOrgOwner not yet implemented');
}

// ABOUTME: Server middleware helpers for authentication and authorization.
// ABOUTME: Provides requireOrgOwner to gate routes to organization owners.

import { auth } from './auth';

export async function requireOrgOwner(req: Request, orgId: string): Promise<void> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    throw Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const member = await auth.api.getActiveMember({
    headers: req.headers,
    query: { organizationId: orgId },
  });

  if (!member || member.role !== 'owner') {
    throw Response.json({ error: 'Forbidden: owner role required' }, { status: 403 });
  }
}

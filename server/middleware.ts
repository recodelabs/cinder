// ABOUTME: Shared middleware helpers for API route handlers.
// ABOUTME: Provides session validation, org membership checks, and owner authorization.
import { auth } from './auth';

export interface SessionInfo {
  userId: string;
  email: string;
}

export async function getSession(req: Request): Promise<SessionInfo | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
  };
}

export async function requireSession(req: Request): Promise<SessionInfo> {
  const session = await getSession(req);
  if (!session) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return session;
}

export interface MemberInfo extends SessionInfo {
  orgId: string;
  role: string;
}

export async function requireOrgMember(req: Request, orgId: string): Promise<MemberInfo> {
  const session = await requireSession(req);
  const org = await auth.api.getFullOrganization({
    headers: req.headers,
    query: { organizationId: orgId },
  });
  if (!org) {
    throw new Response(JSON.stringify({ error: 'Organization not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const userMember = org.members.find((m) => m.userId === session.userId);
  if (!userMember) {
    throw new Response(JSON.stringify({ error: 'Not a member of this organization' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { ...session, orgId, role: userMember.role };
}

export async function requireOrgOwner(req: Request, orgId: string): Promise<MemberInfo> {
  const member = await requireOrgMember(req, orgId);
  if (member.role !== 'owner') {
    throw new Response(JSON.stringify({ error: 'Owner access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return member;
}

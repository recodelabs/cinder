// ABOUTME: Member management API route handlers for organizations.
// ABOUTME: Supports adding members via invitation and removing existing members.

import { z } from 'zod';
import { requireOrgOwner } from '../middleware';
import { auth } from '../auth';

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['member', 'owner']).default('member'),
});

export async function handleDirectAddMember(
  req: Request,
  orgId: string,
): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join(', ') },
      { status: 400 },
    );
  }

  const { email, role } = parsed.data;

  try {
    const result = await auth.api.createInvitation({
      body: { organizationId: orgId, email, role },
      headers: req.headers,
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add member';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function handleRemoveMember(
  req: Request,
  orgId: string,
  userId: string,
): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    await auth.api.removeMember({
      body: { organizationId: orgId, memberIdOrUserId: userId },
      headers: req.headers,
    });
    return new Response(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove member';
    return Response.json({ error: message }, { status: 400 });
  }
}

// ABOUTME: Member management API route handlers for organizations.
// ABOUTME: Supports adding members by email and removing existing members.

import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { requireOrgOwner } from '../middleware';
import { db } from '../db';

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

  // Look up user by email
  const users = await db.execute<{ id: string }>(
    sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`
  );
  if (!users[0]) {
    return Response.json(
      { error: 'User not found — they need to sign in to Cinder first' },
      { status: 404 },
    );
  }

  const userId = users[0].id;

  // Check if already a member
  const existing = await db.execute<{ id: string }>(
    sql`SELECT id FROM "member" WHERE organization_id = ${orgId} AND user_id = ${userId} LIMIT 1`
  );
  if (existing[0]) {
    return Response.json({ error: 'User is already a member' }, { status: 409 });
  }

  // Add directly as member
  const memberId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${memberId}, ${orgId}, ${userId}, ${role}, NOW())
  `);

  return Response.json({ id: memberId, userId, role }, { status: 201 });
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

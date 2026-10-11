// ABOUTME: CRUD API handlers for project resources within an organization.
// ABOUTME: Provides list, create, get, update, and delete operations with org membership checks; FHIR server secrets are stored encrypted and never returned.
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { fhirServerCredential, project } from '../schema';
import { requireOrgMember, requireOrgOwner } from '../middleware';
import { getMasterKey } from '../crypto';
import { encryptClientSecret } from '../fhir-auth';
import { isAllowedFhirHost } from '../fhir-target';
import {
  planFhirCredential,
  projectTargetColumns,
  slugify,
  validateProjectInput,
  type FhirCredentialPlan,
  type ProjectInput,
  type StoredFhirAuth,
} from './project-validation';
import { fhirServerTokens } from './shared';

export { slugify, validateProjectInput } from './project-validation';

type ProjectRow = typeof project.$inferSelect;

/** What the browser sees of a project's client credentials: never the secret itself. */
interface FhirAuthSummary {
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecretSet: boolean;
}

function withFhirAuth(row: ProjectRow, stored: StoredFhirAuth | undefined): ProjectRow & { fhirAuth: FhirAuthSummary | null } {
  return {
    ...row,
    fhirAuth: stored ? { tokenUrl: stored.tokenUrl, clientId: stored.clientId, clientSecretSet: true } : null,
  };
}

async function loadStoredFhirAuth(projectIds: string[]): Promise<Map<string, StoredFhirAuth>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: fhirServerCredential.projectId,
      tokenUrl: fhirServerCredential.tokenUrl,
      clientId: fhirServerCredential.clientId,
    })
    .from(fhirServerCredential)
    .where(inArray(fhirServerCredential.projectId, projectIds));
  return new Map(rows.map((row) => [row.projectId, { tokenUrl: row.tokenUrl, clientId: row.clientId }]));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyFhirCredentialPlan(tx: Tx, projectId: string, plan: FhirCredentialPlan): Promise<void> {
  if (plan.action === 'remove') {
    await tx.delete(fhirServerCredential).where(eq(fhirServerCredential.projectId, projectId));
  } else if (plan.action === 'save') {
    const values = {
      tokenUrl: plan.tokenUrl,
      clientId: plan.clientId,
      ...encryptClientSecret(plan.clientSecret, getMasterKey()),
    };
    await tx
      .insert(fhirServerCredential)
      .values({ projectId, ...values })
      .onConflictDoUpdate({ target: fhirServerCredential.projectId, set: { ...values, updatedAt: new Date() } });
  }
}

/** Generic FHIR server targets, and their token URLs, must be on the CINDER_ALLOWED_FHIR_HOSTS allowlist. */
function rejectDisallowedFhirHost(input: ProjectInput): Response | undefined {
  if (input.serverType !== 'fhir') return undefined;
  const allowlist = process.env.CINDER_ALLOWED_FHIR_HOSTS;
  if (!isAllowedFhirHost(input.fhirBaseUrl, allowlist)) {
    return Response.json(
      { error: 'This FHIR server host is not allowed. Add its hostname to CINDER_ALLOWED_FHIR_HOSTS on the server.' },
      { status: 400 },
    );
  }
  if (input.fhirAuth && !isAllowedFhirHost(input.fhirAuth.tokenUrl, allowlist)) {
    return Response.json(
      { error: 'This token URL host is not allowed. Add its hostname to CINDER_ALLOWED_FHIR_HOSTS on the server.' },
      { status: 400 },
    );
  }
  return undefined;
}

export async function handleListProjects(req: Request, orgId: string): Promise<Response> {
  try {
    await requireOrgMember(req, orgId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const projects = await db
    .select()
    .from(project)
    .where(eq(project.organizationId, orgId))
    .orderBy(project.name);
  const auth = await loadStoredFhirAuth(projects.map((p) => p.id));

  return Response.json(projects.map((p) => withFhirAuth(p, auth.get(p.id))));
}

export async function handleCreateProject(req: Request, orgId: string): Promise<Response> {
  try {
    await requireOrgOwner(req, orgId);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let input: ProjectInput;
  try {
    input = validateProjectInput(body);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Response.json({ error: e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') }, { status: 400 });
    }
    throw e;
  }

  const rejected = rejectDisallowedFhirHost(input);
  if (rejected) return rejected;

  const plan = planFhirCredential(input, undefined);
  if (plan.action === 'reject') {
    return Response.json({ error: plan.error }, { status: 400 });
  }

  const slug = input.slug || slugify(input.name);

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(project).values({
        name: input.name,
        slug,
        description: input.description,
        organizationId: orgId,
        ...projectTargetColumns(input),
      }).returning();
      await applyFhirCredentialPlan(tx, row!.id, plan);
      return row!;
    });

    const stored = plan.action === 'save' ? { tokenUrl: plan.tokenUrl, clientId: plan.clientId } : undefined;
    return Response.json(withFhirAuth(created, stored), { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return Response.json({ error: 'A project with this slug already exists in this organization' }, { status: 409 });
    }
    throw err;
  }
}

export async function handleGetProject(req: Request, projectId: string): Promise<Response> {
  const [found] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId));

  if (!found) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    await requireOrgMember(req, found.organizationId);
  } catch (e) {
    if (e instanceof Response) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }
    throw e;
  }

  const auth = await loadStoredFhirAuth([found.id]);
  return Response.json(withFhirAuth(found, auth.get(found.id)));
}

export async function handleUpdateProject(req: Request, projectId: string): Promise<Response> {
  const [found] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId));

  if (!found) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    await requireOrgOwner(req, found.organizationId);
  } catch (e) {
    if (e instanceof Response) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let input: ProjectInput;
  try {
    input = validateProjectInput(body);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Response.json({ error: e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') }, { status: 400 });
    }
    throw e;
  }

  const rejected = rejectDisallowedFhirHost(input);
  if (rejected) return rejected;

  const stored = (await loadStoredFhirAuth([projectId])).get(projectId);
  const plan = planFhirCredential(input, stored);
  if (plan.action === 'reject') {
    return Response.json({ error: plan.error }, { status: 400 });
  }

  const slug = input.slug || slugify(input.name);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(project)
      .set({
        name: input.name,
        slug,
        description: input.description,
        ...projectTargetColumns(input),
        updatedAt: new Date(),
      })
      .where(eq(project.id, projectId))
      .returning();
    await applyFhirCredentialPlan(tx, projectId, plan);
    return row!;
  });
  // The target or credentials may have changed; the next request fetches a fresh token.
  fhirServerTokens.evict(projectId);

  const nowStored =
    plan.action === 'save' ? { tokenUrl: plan.tokenUrl, clientId: plan.clientId } : plan.action === 'keep' ? stored : undefined;
  return Response.json(withFhirAuth(updated, nowStored));
}

export async function handleDeleteProject(req: Request, projectId: string): Promise<Response> {
  const [found] = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId));

  if (!found) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    await requireOrgOwner(req, found.organizationId);
  } catch (e) {
    if (e instanceof Response) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }
    throw e;
  }

  // fhir_server_credential rows are removed by ON DELETE CASCADE.
  await db
    .delete(project)
    .where(eq(project.id, projectId));
  fhirServerTokens.evict(projectId);

  return new Response(null, { status: 204 });
}

// ABOUTME: CRUD API handlers for project resources within an organization.
// ABOUTME: Provides list, create, get, update, and delete operations with org membership checks.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { project } from '../schema';
import { requireOrgMember, requireOrgOwner } from '../middleware';
import { isAllowedFhirHost } from '../fhir-target';
import { projectTargetColumns, slugify, validateProjectInput, type ProjectInput } from './project-validation';

export { slugify, validateProjectInput } from './project-validation';

/** Generic FHIR server targets must be on the CINDER_ALLOWED_FHIR_HOSTS allowlist. */
function rejectDisallowedFhirHost(input: ProjectInput): Response | undefined {
  if (input.serverType !== 'fhir') return undefined;
  if (isAllowedFhirHost(input.fhirBaseUrl, process.env.CINDER_ALLOWED_FHIR_HOSTS)) return undefined;
  return Response.json(
    { error: 'This FHIR server host is not allowed. Add its hostname to CINDER_ALLOWED_FHIR_HOSTS on the server.' },
    { status: 400 },
  );
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

  return Response.json(projects);
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

  const slug = input.slug || slugify(input.name);

  try {
    const [created] = await db.insert(project).values({
      name: input.name,
      slug,
      description: input.description,
      organizationId: orgId,
      ...projectTargetColumns(input),
    }).returning();

    return Response.json(created, { status: 201 });
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

  return Response.json(found);
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

  const slug = input.slug || slugify(input.name);

  const [updated] = await db
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

  return Response.json(updated);
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

  await db
    .delete(project)
    .where(eq(project.id, projectId));

  return new Response(null, { status: 204 });
}

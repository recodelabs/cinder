// ABOUTME: CRUD API handlers for saved FHIR store configurations.
// ABOUTME: All endpoints require a valid Google access token; stores are scoped to user email.
import { eq, and } from 'drizzle-orm';
import { db } from './db';
import { savedStore } from './schema';
import { getEmailFromToken } from './google-auth';

interface StoreInput {
  name: string;
  gcpProject: string;
  gcpLocation: string;
  gcpDataset: string;
  gcpFhirStore: string;
}

async function authenticateRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  return getEmailFromToken(auth.slice(7));
}

export async function handleListStores(req: Request): Promise<Response> {
  const email = await authenticateRequest(req);
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stores = await db
    .select()
    .from(savedStore)
    .where(eq(savedStore.userEmail, email))
    .orderBy(savedStore.name);

  return Response.json(stores);
}

export async function handleCreateStore(req: Request): Promise<Response> {
  const email = await authenticateRequest(req);
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: StoreInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name || !body.gcpProject || !body.gcpLocation || !body.gcpDataset || !body.gcpFhirStore) {
    return Response.json({ error: 'Missing required fields: name, gcpProject, gcpLocation, gcpDataset, gcpFhirStore' }, { status: 400 });
  }

  try {
    const [created] = await db.insert(savedStore).values({
      userEmail: email,
      name: body.name,
      gcpProject: body.gcpProject,
      gcpLocation: body.gcpLocation,
      gcpDataset: body.gcpDataset,
      gcpFhirStore: body.gcpFhirStore,
    }).returning();

    return Response.json(created, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return Response.json({ error: 'A store with this name already exists' }, { status: 409 });
    }
    throw err;
  }
}

export async function handleDeleteStore(req: Request, storeId: string): Promise<Response> {
  const email = await authenticateRequest(req);
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const deleted = await db
    .delete(savedStore)
    .where(and(eq(savedStore.id, storeId), eq(savedStore.userEmail, email)))
    .returning();

  if (deleted.length === 0) {
    return Response.json({ error: 'Store not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}

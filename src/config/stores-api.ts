// ABOUTME: Client functions for the saved stores API.
// ABOUTME: Provides list, create, and delete operations for user's saved FHIR stores.

export interface SavedStore {
  id: string;
  userEmail: string;
  name: string;
  gcpProject: string;
  gcpLocation: string;
  gcpDataset: string;
  gcpFhirStore: string;
  createdAt: string;
  updatedAt: string;
}

export async function listSavedStores(accessToken: string): Promise<SavedStore[]> {
  const res = await fetch('/api/stores', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to load saved stores');
  return res.json();
}

export async function createSavedStore(
  accessToken: string,
  store: {
    name: string;
    gcpProject: string;
    gcpLocation: string;
    gcpDataset: string;
    gcpFhirStore: string;
  }
): Promise<SavedStore> {
  const res = await fetch('/api/stores', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(store),
  });
  if (res.status === 409) throw new Error('A store with this name already exists');
  if (!res.ok) throw new Error('Failed to save store');
  return res.json();
}

export async function deleteSavedStore(accessToken: string, storeId: string): Promise<void> {
  const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to delete store');
}

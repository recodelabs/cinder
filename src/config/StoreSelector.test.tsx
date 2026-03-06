// ABOUTME: Tests for the FHIR store configuration selector and storeBaseUrl helper.
// ABOUTME: Verifies form submission, config persistence, saved stores, and URL generation.
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeBaseUrl } from './StoreConfig';
import { StoreSelector } from './StoreSelector';
import type { SavedStore } from './stores-api';

function renderWithMantine(ui: JSX.Element): ReturnType<typeof render> {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

const fakeSavedStores: SavedStore[] = [
  {
    id: 'store-1',
    userEmail: 'test@example.com',
    name: 'My Dev Store',
    gcpProject: 'dev-project',
    gcpLocation: 'us-central1',
    gcpDataset: 'dev-dataset',
    gcpFhirStore: 'dev-fhir',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'store-2',
    userEmail: 'test@example.com',
    name: 'My Prod Store',
    gcpProject: 'prod-project',
    gcpLocation: 'us-east1',
    gcpDataset: 'prod-dataset',
    gcpFhirStore: 'prod-fhir',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

function mockFetchForStores(stores: SavedStore[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/stores' && (!init?.method || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(stores),
        });
      }
      if (url === '/api/stores' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as Record<string, string>;
        const created: SavedStore = {
          id: 'store-new',
          userEmail: 'test@example.com',
          name: body['name'] ?? '',
          gcpProject: body['gcpProject'] ?? '',
          gcpLocation: body['gcpLocation'] ?? '',
          gcpDataset: body['gcpDataset'] ?? '',
          gcpFhirStore: body['gcpFhirStore'] ?? '',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        };
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(created),
        });
      }
      if (typeof url === 'string' && url.startsWith('/api/stores/') && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    })
  );
}

describe('storeBaseUrl', () => {
  it('builds Healthcare API URL from config', () => {
    const url = storeBaseUrl({
      type: 'gcp',
      project: 'my-proj',
      location: 'us-central1',
      dataset: 'my-ds',
      fhirStore: 'my-store',
    });
    expect(url).toBe(
      'https://healthcare.googleapis.com/v1/projects/my-proj/locations/us-central1/datasets/my-ds/fhirStores/my-store'
    );
  });
});

describe('StoreSelector', () => {
  beforeEach(() => {
    mockFetchForStores(fakeSavedStores);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders form fields for project, location, dataset, store', () => {
    renderWithMantine(<StoreSelector onSubmit={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /project id/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /location/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /dataset/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /fhir store/i })).toBeDefined();
  });

  it('calls onSubmit with config values including type', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<StoreSelector onSubmit={onSubmit} />);

    const projectInput = screen.getByRole('textbox', { name: /project id/i });
    const locationInput = screen.getByRole('textbox', { name: /location/i });
    const datasetInput = screen.getByRole('textbox', { name: /dataset/i });
    const storeInput = screen.getByRole('textbox', { name: /fhir store/i });

    await user.clear(projectInput);
    await user.type(projectInput, 'my-project');
    await user.clear(locationInput);
    await user.type(locationInput, 'us-central1');
    await user.clear(datasetInput);
    await user.type(datasetInput, 'my-dataset');
    await user.clear(storeInput);
    await user.type(storeInput, 'my-store');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'gcp',
      project: 'my-project',
      location: 'us-central1',
      dataset: 'my-dataset',
      fhirStore: 'my-store',
    });
  });

  it('displays saved stores when accessToken is provided', async () => {
    renderWithMantine(<StoreSelector onSubmit={vi.fn()} accessToken="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('My Dev Store')).toBeDefined();
    });
    expect(screen.getByText('My Prod Store')).toBeDefined();
    expect(screen.getByText('dev-project/dev-dataset/dev-fhir')).toBeDefined();
    expect(screen.getByText('Your Saved Stores')).toBeDefined();
  });

  it('calls onSubmit with correct config when clicking a saved store', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<StoreSelector onSubmit={onSubmit} accessToken="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('My Dev Store')).toBeDefined();
    });

    await user.click(screen.getByText('My Dev Store'));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'gcp',
      project: 'dev-project',
      location: 'us-central1',
      dataset: 'dev-dataset',
      fhirStore: 'dev-fhir',
    });
  });

  it('shows Connect & Save button when store name is filled and accessToken provided', async () => {
    const user = userEvent.setup();
    renderWithMantine(<StoreSelector onSubmit={vi.fn()} accessToken="test-token" />);

    // Wait for saved stores to load
    await waitFor(() => {
      expect(screen.getByText('My Dev Store')).toBeDefined();
    });

    // Initially no Connect & Save button
    expect(screen.queryByRole('button', { name: /connect & save/i })).toBeNull();

    // Type a store name
    const nameInput = screen.getByRole('textbox', { name: /store name/i });
    await user.type(nameInput, 'New Store');

    expect(screen.getByRole('button', { name: /connect & save/i })).toBeDefined();
  });

  it('does not show Connect & Save button without accessToken', async () => {
    const user = userEvent.setup();
    renderWithMantine(<StoreSelector onSubmit={vi.fn()} />);

    const nameInput = screen.getByRole('textbox', { name: /store name/i });
    await user.type(nameInput, 'New Store');

    expect(screen.queryByRole('button', { name: /connect & save/i })).toBeNull();
  });

  it('removes a store from the list after deleting', async () => {
    const user = userEvent.setup();
    renderWithMantine(<StoreSelector onSubmit={vi.fn()} accessToken="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('My Dev Store')).toBeDefined();
    });

    const deleteButton = screen.getByRole('button', { name: /delete my dev store/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText('My Dev Store')).toBeNull();
    });
    // The other store should still be there
    expect(screen.getByText('My Prod Store')).toBeDefined();
  });

  it('does not show saved stores section without accessToken', () => {
    renderWithMantine(<StoreSelector onSubmit={vi.fn()} />);
    expect(screen.queryByText('Your Saved Stores')).toBeNull();
  });
});

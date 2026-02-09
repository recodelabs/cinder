// ABOUTME: Tests for the FHIR store configuration selector and storeBaseUrl helper.
// ABOUTME: Verifies form submission, config persistence, and URL generation.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { storeBaseUrl } from './StoreConfig';
import { StoreSelector } from './StoreSelector';

function renderWithMantine(ui: JSX.Element): ReturnType<typeof render> {
  return render(<MantineProvider>{ui}</MantineProvider>);
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

    await user.type(screen.getByRole('textbox', { name: /project id/i }), 'my-project');
    await user.type(screen.getByRole('textbox', { name: /location/i }), 'us-central1');
    await user.type(screen.getByRole('textbox', { name: /dataset/i }), 'my-dataset');
    await user.type(screen.getByRole('textbox', { name: /fhir store/i }), 'my-store');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'gcp',
      project: 'my-project',
      location: 'us-central1',
      dataset: 'my-dataset',
      fhirStore: 'my-store',
    });
  });
});

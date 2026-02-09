// ABOUTME: Tests for the FHIR store configuration selector.
// ABOUTME: Verifies form submission and config persistence.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StoreSelector } from './StoreSelector';

function renderWithMantine(ui: JSX.Element): ReturnType<typeof render> {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('StoreSelector', () => {
  it('renders form fields for project, location, dataset, store', () => {
    renderWithMantine(<StoreSelector onSubmit={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /project id/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /location/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /dataset/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /fhir store/i })).toBeDefined();
  });

  it('calls onSubmit with config values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<StoreSelector onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox', { name: /project id/i }), 'my-project');
    await user.type(screen.getByRole('textbox', { name: /location/i }), 'us-central1');
    await user.type(screen.getByRole('textbox', { name: /dataset/i }), 'my-dataset');
    await user.type(screen.getByRole('textbox', { name: /fhir store/i }), 'my-store');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      project: 'my-project',
      location: 'us-central1',
      dataset: 'my-dataset',
      fhirStore: 'my-store',
    });
  });
});

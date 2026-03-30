// ABOUTME: Tests for the resource creation page.
// ABOUTME: Verifies ResourceForm renders for new resource creation.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { ResourceCreatePage } from './ResourceCreatePage';

function renderCreatePage(
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({});
  medplumOverrides?.(medplum);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/Patient/new']}>
          <Routes>
            <Route path=":resourceType/new" element={<ResourceCreatePage resourceType="Patient" />} />
            <Route path=":resourceType/:id" element={<div data-testid="detail-page" />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

describe('ResourceCreatePage', () => {
  it('renders ResourceForm with Create button', async () => {
    renderCreatePage();
    expect(await screen.findByRole('button', { name: 'Create' })).toBeDefined();
  });

  it('shows error when create fails', async () => {
    renderCreatePage((medplum) => {
      vi.spyOn(medplum, 'createResource').mockRejectedValue(new Error('Validation failed'));
    });
    const createBtn = await screen.findByRole('button', { name: 'Create' });
    await userEvent.click(createBtn);
    expect(await screen.findByText('Validation failed')).toBeDefined();
  });

  it('renders a mode toggle with Form and JSON options', async () => {
    renderCreatePage();
    expect(await screen.findByRole('radio', { name: 'Form' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'JSON' })).toBeDefined();
  });

  it('defaults to Form mode showing ResourceForm', async () => {
    renderCreatePage();
    expect(await screen.findByRole('button', { name: 'Create' })).toBeDefined();
    expect(screen.queryByTestId('create-json-input')).toBeNull();
  });

  it('switches to JSON mode when JSON is selected', async () => {
    renderCreatePage();
    const jsonRadio = await screen.findByRole('radio', { name: 'JSON' });
    await userEvent.click(jsonRadio);
    expect(screen.getByTestId('create-json-input')).toBeDefined();
  });

  it('pre-populates JSON with the resourceType', async () => {
    renderCreatePage();
    const jsonRadio = await screen.findByRole('radio', { name: 'JSON' });
    await userEvent.click(jsonRadio);
    const input = screen.getByTestId('create-json-input');
    expect(input.textContent).toContain('resourceType');
    expect(input.textContent).toContain('Patient');
  });

  it('creates resource from JSON input', async () => {
    let createdResource: Resource | undefined;
    renderCreatePage((medplum) => {
      vi.spyOn(medplum, 'createResource').mockImplementation(async (resource: Resource) => {
        createdResource = resource;
        return { ...resource, id: '123' };
      });
    });
    const jsonRadio = await screen.findByRole('radio', { name: 'JSON' });
    await userEvent.click(jsonRadio);
    const createBtn = screen.getByRole('button', { name: 'Create' });
    await userEvent.click(createBtn);
    expect(await screen.findByTestId('detail-page')).toBeDefined();
    expect(createdResource?.resourceType).toBe('Patient');
  });

  it('shows parse error for invalid JSON', async () => {
    renderCreatePage();
    const jsonRadio = await screen.findByRole('radio', { name: 'JSON' });
    await userEvent.click(jsonRadio);
    // The JsonInput renders a textbox role element
    const textbox = screen.getByRole('textbox');
    await userEvent.clear(textbox);
    await userEvent.type(textbox, '{{invalid json');
    const createBtn = screen.getByRole('button', { name: 'Create' });
    await userEvent.click(createBtn);
    expect(await screen.findByText('Invalid JSON. Please fix syntax errors before saving.')).toBeDefined();
  });
});

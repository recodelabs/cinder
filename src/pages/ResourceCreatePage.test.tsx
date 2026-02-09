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
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => undefined });
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
});

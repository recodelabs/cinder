// ABOUTME: Tests for the tabbed resource detail page.
// ABOUTME: Verifies Details/Edit/JSON tabs and Delete button rendering.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Patient } from '@medplum/fhirtypes';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { ResourceDetailPage } from './ResourceDetailPage';

const testPatient: Patient = {
  resourceType: 'Patient',
  id: 'test-1',
  name: [{ family: 'Smith', given: ['John'] }],
};

function renderDetailPage(path = '/Patient/test-1'): ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });
  vi.spyOn(medplum, 'readResource').mockResolvedValue(testPatient as any);

  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path=":resourceType/:id" element={<ResourceDetailPage />} />
            <Route path=":resourceType/:id/:tab" element={<ResourceDetailPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('ResourceDetailPage', () => {
  it('renders Delete button after loading', async () => {
    renderDetailPage();
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeDefined();
  });

  it('renders Details, Edit, and JSON tabs', async () => {
    renderDetailPage();
    expect(await screen.findByRole('tab', { name: 'Details' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Edit' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'JSON' })).toBeDefined();
  });

  it('shows resource header by default', async () => {
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeDefined();
    });
  });

  it('shows JSON tab when navigated to /json', async () => {
    renderDetailPage('/Patient/test-1/json');
    expect(await screen.findByTestId('resource-json')).toBeDefined();
    expect(screen.getByRole('button', { name: 'OK' })).toBeDefined();
  });
});

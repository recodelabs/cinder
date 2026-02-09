// ABOUTME: Tests for the resource detail page.
// ABOUTME: Verifies Edit and Delete buttons render on the detail view.
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

function renderDetailPage(): ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });
  vi.spyOn(medplum, 'readResource').mockResolvedValue(testPatient);

  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/Patient/test-1']}>
          <Routes>
            <Route path=":resourceType/:id" element={<ResourceDetailPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('ResourceDetailPage', () => {
  it('renders Edit and Delete buttons after loading', async () => {
    renderDetailPage();
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined();
  });

  it('renders resource details', async () => {
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Patient/test-1')).toBeDefined();
    });
  });
});

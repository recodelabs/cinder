// ABOUTME: Tests for the resource type listing page.
// ABOUTME: Verifies the New button and search results rendering.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Bundle, Patient } from '@medplum/fhirtypes';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { ResourceTypePage } from './ResourceTypePage';

const mockBundle: Bundle<Patient> = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    { resource: { resourceType: 'Patient', id: '1', name: [{ family: 'Smith', given: ['John'] }] } },
  ],
};

function renderTypePage(): ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });
  vi.spyOn(medplum, 'search').mockResolvedValue(mockBundle);

  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/Patient']}>
          <Routes>
            <Route path=":resourceType" element={<ResourceTypePage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('ResourceTypePage', () => {
  it('renders the New button', async () => {
    renderTypePage();
    expect(await screen.findByRole('button', { name: 'New' })).toBeDefined();
  });

  it('renders search results', async () => {
    renderTypePage();
    expect(await screen.findByText('John Smith')).toBeDefined();
  });
});

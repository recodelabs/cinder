// ABOUTME: Tests for the resource type listing page with search controls.
// ABOUTME: Verifies SearchControl renders with Fields/Filters toolbar and handles navigation.
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
  total: 1,
  entry: [
    { resource: { resourceType: 'Patient', id: '1', name: [{ family: 'Smith', given: ['John'] }] } },
  ],
};

function renderTypePage(path = '/Patient'): ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });
  vi.spyOn(medplum, 'search').mockResolvedValue(mockBundle as any);

  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path=":resourceType" element={<ResourceTypePage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('ResourceTypePage', () => {
  it('renders the Fields toolbar button', async () => {
    renderTypePage();
    expect(await screen.findByText('Fields')).toBeDefined();
  });

  it('renders the Filters toolbar button', async () => {
    renderTypePage();
    expect(await screen.findByText('Filters')).toBeDefined();
  });

  it('renders the New toolbar button', async () => {
    renderTypePage();
    expect(await screen.findByText('New...')).toBeDefined();
  });
});

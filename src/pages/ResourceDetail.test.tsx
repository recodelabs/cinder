// ABOUTME: Tests for the resource detail view.
// ABOUTME: Verifies rendering of FHIR resource properties using Medplum components.
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ResourceDetail } from './ResourceDetail';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import type { Patient } from '@medplum/fhirtypes';

const testPatient: Patient = {
  resourceType: 'Patient',
  id: 'test-1',
  name: [{ family: 'Smith', given: ['John'] }],
  gender: 'male',
  birthDate: '1990-01-15',
};

function renderWithProviders(ui: JSX.Element): ReturnType<typeof render> {
  vi.stubGlobal('fetch', vi.fn());
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });
  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          {ui}
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('ResourceDetail', () => {
  it('renders resource type and id', () => {
    renderWithProviders(<ResourceDetail resource={testPatient} />);
    expect(screen.getByText('Patient/test-1')).toBeDefined();
  });

  it('renders patient gender', () => {
    renderWithProviders(<ResourceDetail resource={testPatient} />);
    expect(screen.getByText('male')).toBeDefined();
  });

  it('renders patient name after async load', async () => {
    renderWithProviders(<ResourceDetail resource={testPatient} />);
    await waitFor(() => {
      expect(screen.getByText(/Smith/)).toBeDefined();
    });
  });
});

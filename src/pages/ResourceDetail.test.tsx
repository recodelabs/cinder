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
import type { Patient, RelatedPerson } from '@medplum/fhirtypes';
import { ReadablePromise } from '@medplum/core';

const testPatient: Patient = {
  resourceType: 'Patient',
  id: 'test-1',
  name: [{ family: 'Smith', given: ['John'] }],
  gender: 'male',
  birthDate: '1990-01-15',
};

const referencedPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-abc',
  name: [{ family: 'Goncalves', given: ['Ricardo'] }],
};

const testRelatedPerson: RelatedPerson = {
  resourceType: 'RelatedPerson',
  id: 'rp-1',
  patient: { reference: 'Patient/patient-abc' },
  relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'CHILD', display: 'child' }] }],
};

function renderWithProviders(ui: JSX.Element, medplumOverrides?: (m: HealthcareMedplumClient) => void): ReturnType<typeof render> {
  vi.stubGlobal('fetch', vi.fn());
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });
  medplumOverrides?.(medplum);
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
  it('renders humanized property labels', () => {
    renderWithProviders(<ResourceDetail resource={testPatient} />);
    expect(screen.getByText('Gender')).toBeDefined();
    expect(screen.getByText('Birth Date')).toBeDefined();
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

  it('renders resolved patient name for Reference fields', async () => {
    renderWithProviders(
      <ResourceDetail resource={testRelatedPerson} />,
      (medplum) => {
        vi.spyOn(medplum, 'readReference').mockReturnValue(
          new ReadablePromise(Promise.resolve(referencedPatient)) as ReturnType<typeof medplum.readReference>
        );
      }
    );
    await waitFor(() => {
      expect(screen.getByText('Ricardo Goncalves')).toBeDefined();
    });
  });
});

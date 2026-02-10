// ABOUTME: Tests for the PatientRelationships component.
// ABOUTME: Verifies loading, empty, and populated states for RelatedPerson queries.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Bundle, RelatedPerson } from '@medplum/fhirtypes';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { PatientRelationships } from './PatientRelationships';

function renderRelationships(
  patientId: string,
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });
  medplumOverrides?.(medplum);

  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <PatientRelationships patientId={patientId} />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

const childRelatedPerson: RelatedPerson = {
  resourceType: 'RelatedPerson',
  id: 'rp-1',
  patient: { reference: 'Patient/pat-1' },
  name: [{ family: 'Smith', given: ['Jane'] }],
  relationship: [
    { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'CHILD', display: 'child' }] },
  ],
};

const emptyBundle: Bundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [],
  total: 0,
};

const bundleWithChild: Bundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [{ resource: childRelatedPerson }],
  total: 1,
};

describe('PatientRelationships', () => {
  it('shows empty message when no relationships found', async () => {
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(emptyBundle as any);
    });
    expect(await screen.findByText('No relationships found')).toBeDefined();
  });

  it('renders relationship type and name', async () => {
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(bundleWithChild as any);
    });
    expect(await screen.findByText(/child/)).toBeDefined();
    expect(screen.getByText('Jane Smith')).toBeDefined();
  });

  it('links to the RelatedPerson detail page', async () => {
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(bundleWithChild as any);
    });
    const link = await screen.findByRole('link', { name: 'Jane Smith' });
    expect(link.getAttribute('href')).toBe('/RelatedPerson/rp-1');
  });

  it('searches for RelatedPerson with patient parameter', async () => {
    const { medplum } = renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(emptyBundle as any);
    });
    await screen.findByText('No relationships found');
    expect(medplum.search).toHaveBeenCalledWith('RelatedPerson', 'patient=pat-1');
  });
});

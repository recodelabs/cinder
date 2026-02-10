// ABOUTME: Tests for the PatientRelationships component.
// ABOUTME: Verifies loading, empty, and populated states for RelatedPerson queries.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Bundle, Patient, RelatedPerson } from '@medplum/fhirtypes';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { PatientRelationships } from './PatientRelationships';

const IDENTIFIER_SYSTEM = 'http://example.org/fhir/related-person-patient';

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

const linkedChild: Patient = {
  resourceType: 'Patient',
  id: 'child-123',
  name: [{ family: 'Berg', given: ['Milton'] }],
};

const parentOfRelatedPerson: RelatedPerson = {
  resourceType: 'RelatedPerson',
  id: 'rp-1',
  patient: { reference: 'Patient/pat-1' },
  relationship: [
    { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'CHILD', display: 'Parent of' }] },
  ],
  identifier: [{ system: IDENTIFIER_SYSTEM, value: 'child-123' }],
};

const rpWithoutIdentifier: RelatedPerson = {
  resourceType: 'RelatedPerson',
  id: 'rp-2',
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

const bundleWithParentOf: Bundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [{ resource: parentOfRelatedPerson }],
  total: 1,
};

const bundleWithNoIdentifier: Bundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [{ resource: rpWithoutIdentifier }],
  total: 1,
};

describe('PatientRelationships', () => {
  it('shows empty message when no relationships found', async () => {
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(emptyBundle as any);
    });
    expect(await screen.findByText('No relationships found')).toBeDefined();
  });

  it('resolves linked patient and shows their name', async () => {
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(bundleWithParentOf as any);
      vi.spyOn(medplum, 'readResource').mockResolvedValue(linkedChild);
    });
    expect(await screen.findByText('Milton Berg')).toBeDefined();
    expect(screen.getByText(/Parent of/)).toBeDefined();
  });

  it('links to the linked Patient page', async () => {
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(bundleWithParentOf as any);
      vi.spyOn(medplum, 'readResource').mockResolvedValue(linkedChild);
    });
    const link = await screen.findByRole('link', { name: 'Milton Berg' });
    expect(link.getAttribute('href')).toBe('/Patient/child-123');
  });

  it('falls back to RP display string when no linked patient identifier', async () => {
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(bundleWithNoIdentifier as any);
    });
    expect(await screen.findByText('Jane Smith')).toBeDefined();
  });

  it('searches for RelatedPerson with patient parameter', async () => {
    const { medplum } = renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(emptyBundle as any);
    });
    await screen.findByText('No relationships found');
    expect(medplum.search).toHaveBeenCalledWith('RelatedPerson', 'patient=pat-1');
  });
});

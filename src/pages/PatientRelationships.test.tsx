// ABOUTME: Tests for the PatientRelationships component.
// ABOUTME: Verifies relationship display, add form interactions, and bidirectional creation.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Bundle, Patient, RelatedPerson } from '@medplum/fhirtypes';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { createBidirectionalRelationship, PatientRelationships } from './PatientRelationships';

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
  it('shows add button when no relationships found', async () => {
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(emptyBundle as any);
    });
    expect(await screen.findByRole('button', { name: /add person/i })).toBeDefined();
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
    await screen.findByRole('button', { name: /add person/i });
    expect(medplum.search).toHaveBeenCalledWith('RelatedPerson', 'patient=pat-1');
  });
});

const patientSearchBundle: Bundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [{ resource: { resourceType: 'Patient', id: 'target-456', name: [{ family: 'Doe', given: ['Jane'] }] } }],
  total: 1,
};

describe('PatientRelationships add form', () => {
  it('renders "Add Person" button', async () => {
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(emptyBundle as any);
    });
    expect(await screen.findByRole('button', { name: /add person/i })).toBeDefined();
  });

  it('clicking button shows the form', async () => {
    const user = userEvent.setup();
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(emptyBundle as any);
    });
    const btn = await screen.findByRole('button', { name: /add person/i });
    await user.click(btn);
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
  });

  it('cancelling hides the form', async () => {
    const user = userEvent.setup();
    renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockResolvedValue(emptyBundle as any);
    });
    await user.click(await screen.findByRole('button', { name: /add person/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('patient search calls medplum.search with name parameter', async () => {
    const user = userEvent.setup();
    const { medplum } = renderRelationships('pat-1', (medplum) => {
      vi.spyOn(medplum, 'search').mockImplementation(async (type: string) => {
        if (type === 'Patient') {
          return patientSearchBundle as any;
        }
        return emptyBundle as any;
      });
    });
    await user.click(await screen.findByRole('button', { name: /add person/i }));
    const input = screen.getByRole('textbox', { name: /patient/i });
    await user.type(input, 'Jane');
    await waitFor(() => {
      expect(medplum.search).toHaveBeenCalledWith('Patient', expect.objectContaining({ name: 'Jane', _count: '5' }));
    });
  });
});

describe('createBidirectionalRelationship', () => {
  it('creates forward and inverse RelatedPerson resources for Parent of', async () => {
    const createResource = vi.fn().mockImplementation(async (r: any) => r);
    const client = { createResource };

    await createBidirectionalRelationship(client, 'pat-1', 'target-456', 'CHILD');

    expect(createResource).toHaveBeenCalledTimes(2);

    const rp1 = createResource.mock.calls[0][0] as RelatedPerson;
    const rp2 = createResource.mock.calls[1][0] as RelatedPerson;

    // Forward: patient=pat-1, relationship=CHILD/"Parent of", identifier=target-456
    expect(rp1.patient?.reference).toBe('Patient/pat-1');
    expect(rp1.relationship?.[0]?.coding?.[0]?.code).toBe('CHILD');
    expect(rp1.relationship?.[0]?.coding?.[0]?.display).toBe('Parent of');
    expect(rp1.identifier?.[0]?.value).toBe('target-456');

    // Inverse: patient=target-456, relationship=PRN/"Child of", identifier=pat-1
    expect(rp2.patient?.reference).toBe('Patient/target-456');
    expect(rp2.relationship?.[0]?.coding?.[0]?.code).toBe('PRN');
    expect(rp2.relationship?.[0]?.coding?.[0]?.display).toBe('Child of');
    expect(rp2.identifier?.[0]?.value).toBe('pat-1');
  });

  it('creates forward and inverse RelatedPerson resources for Child of', async () => {
    const createResource = vi.fn().mockImplementation(async (r: any) => r);
    const client = { createResource };

    await createBidirectionalRelationship(client, 'pat-1', 'target-456', 'PRN');

    const rp1 = createResource.mock.calls[0][0] as RelatedPerson;
    const rp2 = createResource.mock.calls[1][0] as RelatedPerson;

    expect(rp1.relationship?.[0]?.coding?.[0]?.code).toBe('PRN');
    expect(rp1.relationship?.[0]?.coding?.[0]?.display).toBe('Child of');
    expect(rp2.relationship?.[0]?.coding?.[0]?.code).toBe('CHILD');
    expect(rp2.relationship?.[0]?.coding?.[0]?.display).toBe('Parent of');
  });

  it('throws for unknown relationship code', async () => {
    const client = { createResource: vi.fn() };
    await expect(createBidirectionalRelationship(client, 'a', 'b', 'UNKNOWN'))
      .rejects.toThrow('Unknown relationship code: UNKNOWN');
  });

  it('propagates creation errors', async () => {
    const createResource = vi.fn().mockRejectedValue(new Error('Server error'));
    const client = { createResource };
    await expect(createBidirectionalRelationship(client, 'a', 'b', 'CHILD'))
      .rejects.toThrow('Server error');
  });
});

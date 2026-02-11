// ABOUTME: Tests for the tabbed resource detail page.
// ABOUTME: Verifies Details/Edit/JSON tabs and Delete button rendering.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Bundle, Patient, RelatedPerson } from '@medplum/fhirtypes';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { ResourceDetailPage } from './ResourceDetailPage';

const testPatient: Patient = {
  resourceType: 'Patient',
  id: 'test-1',
  name: [{ family: 'Smith', given: ['John'] }],
};

function renderDetailPage(
  path = '/Patient/test-1',
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });
  vi.spyOn(medplum, 'readResource').mockResolvedValue(testPatient as any);
  medplumOverrides?.(medplum);

  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path=":resourceType/:id" element={<ResourceDetailPage />} />
            <Route path=":resourceType/:id/:tab" element={<ResourceDetailPage />} />
            <Route path=":resourceType" element={<div data-testid="list-page" />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
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

  it('shows error when delete fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetailPage('/Patient/test-1', (medplum) => {
      vi.spyOn(medplum, 'deleteResource').mockRejectedValue(new Error('Forbidden'));
    });
    const deleteBtn = await screen.findByRole('button', { name: 'Delete' });
    await user.click(deleteBtn);
    expect(await screen.findByText('Forbidden')).toBeDefined();
  });

  it('navigates to list after successful delete', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetailPage('/Patient/test-1', (medplum) => {
      vi.spyOn(medplum, 'deleteResource').mockResolvedValue(undefined as any);
    });
    const deleteBtn = await screen.findByRole('button', { name: 'Delete' });
    await user.click(deleteBtn);
    await waitFor(() => {
      expect(screen.getByTestId('list-page')).toBeDefined();
    });
  });

  it('disables Delete button while saving', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let resolveDelete: () => void;
    renderDetailPage('/Patient/test-1', (medplum) => {
      vi.spyOn(medplum, 'deleteResource').mockReturnValue(
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }) as any
      );
    });
    const deleteBtn = await screen.findByRole('button', { name: 'Delete' });
    await user.click(deleteBtn);
    await waitFor(() => {
      expect(deleteBtn).toHaveProperty('disabled', true);
    });
    resolveDelete!();
  });

  it('shows relationships section on RelatedPerson detail page', async () => {
    const testRP: RelatedPerson = {
      resourceType: 'RelatedPerson',
      id: 'rp-1',
      patient: { reference: 'Patient/test-1' },
      relationship: [{ coding: [{ code: 'PRN', display: 'Parent' }] }],
      identifier: [{ system: 'http://example.org/fhir/related-person-patient', value: 'parent-123' }],
    };
    const linkedParent: Patient = {
      resourceType: 'Patient',
      id: 'parent-123',
      name: [{ family: 'Berg', given: ['Matt'] }],
    };
    const rpBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: testRP }],
      total: 1,
    };

    renderDetailPage('/RelatedPerson/rp-1', (medplum) => {
      vi.spyOn(medplum, 'readResource').mockImplementation((type: string, id: string) => {
        if (type === 'RelatedPerson' && id === 'rp-1') return Promise.resolve(testRP) as any;
        if (type === 'Patient' && id === 'parent-123') return Promise.resolve(linkedParent) as any;
        return Promise.reject(new Error('Not found'));
      });
      vi.spyOn(medplum, 'search').mockResolvedValue(rpBundle as any);
    });

    expect(await screen.findByText('Relationships')).toBeDefined();
    expect(await screen.findByText('Matt Berg')).toBeDefined();
  });
});

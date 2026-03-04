// ABOUTME: Tests for the delete patient resources page component.
// ABOUTME: Verifies multi-step flow: patient selection, resource count preview, and deletion.
import { MantineProvider } from '@mantine/core';
import type { Bundle, ResourceType } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { DeletePatientResourcesPage } from './DeletePatientResourcesPage';

function renderPage(
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => undefined });
  medplumOverrides?.(medplum);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/delete-patient-resources']}>
          <DeletePatientResourcesPage />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

describe('DeletePatientResourcesPage', () => {
  it('renders the select patient step initially', () => {
    renderPage();
    expect(screen.getByText('Delete Patient Resources')).toBeDefined();
    expect(screen.getByPlaceholderText('Search by name...')).toBeDefined();
  });

  it('loads resource counts after selecting a patient', async () => {
    const user = userEvent.setup();

    renderPage((medplum) => {
      vi.spyOn(medplum, 'search').mockImplementation(
        (type: ResourceType, params?: Record<string, string>) => {
          // Patient search
          if (type === 'Patient') {
            return Promise.resolve({
              resourceType: 'Bundle',
              type: 'searchset',
              entry: [
                {
                  resource: {
                    resourceType: 'Patient',
                    id: 'test-patient-1',
                    name: [{ given: ['John'], family: 'Smith' }],
                  },
                },
              ],
            } as Bundle);
          }
          // Count queries
          if (params?._summary === 'count') {
            if (type === 'Observation') {
              return Promise.resolve({
                resourceType: 'Bundle',
                type: 'searchset',
                total: 5,
              } as Bundle);
            }
            if (type === 'Condition') {
              return Promise.resolve({
                resourceType: 'Bundle',
                type: 'searchset',
                total: 2,
              } as Bundle);
            }
            return Promise.resolve({
              resourceType: 'Bundle',
              type: 'searchset',
              total: 0,
            } as Bundle);
          }
          return Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            total: 0,
          } as Bundle);
        }
      );
    });

    // Type in the search box
    const searchInput = screen.getByPlaceholderText('Search by name...');
    await user.type(searchInput, 'John');

    // Select the patient from the dropdown
    const option = await screen.findByText('Patient/test-patient-1');
    await user.click(option);

    // Should show preview with counts
    expect(await screen.findByText('Observation')).toBeDefined();
    expect(await screen.findByText('5')).toBeDefined();
    expect(await screen.findByText('2')).toBeDefined();
    expect(screen.getByText('Delete Selected')).toBeDefined();
  });

  it('deletes selected resource types after confirmation', async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.fn().mockResolvedValue(undefined);

    renderPage((medplum) => {
      vi.spyOn(medplum, 'search').mockImplementation(
        (type: ResourceType, params?: Record<string, string>) => {
          // Patient search
          if (type === 'Patient') {
            return Promise.resolve({
              resourceType: 'Bundle',
              type: 'searchset',
              entry: [
                {
                  resource: {
                    resourceType: 'Patient',
                    id: 'patient-123',
                    name: [{ given: ['Jane'], family: 'Doe' }],
                  },
                },
              ],
            } as Bundle);
          }
          // Count queries
          if (params?._summary === 'count') {
            if (type === 'Observation') {
              return Promise.resolve({
                resourceType: 'Bundle',
                type: 'searchset',
                total: 2,
              } as Bundle);
            }
            return Promise.resolve({
              resourceType: 'Bundle',
              type: 'searchset',
              total: 0,
            } as Bundle);
          }
          // ID fetching for deletion
          if (params?._elements === 'id') {
            if (type === 'Observation') {
              return Promise.resolve({
                resourceType: 'Bundle',
                type: 'searchset',
                entry: [
                  { resource: { resourceType: 'Observation', id: 'obs-1' } },
                  { resource: { resourceType: 'Observation', id: 'obs-2' } },
                ],
              } as Bundle);
            }
            return Promise.resolve({
              resourceType: 'Bundle',
              type: 'searchset',
              entry: [],
            } as Bundle);
          }
          return Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            total: 0,
          } as Bundle);
        }
      );
      vi.spyOn(medplum, 'deleteResource').mockImplementation(deleteSpy);
    });

    // Search and select patient
    const searchInput = screen.getByPlaceholderText('Search by name...');
    await user.type(searchInput, 'Jane');

    const option = await screen.findByText('Patient/patient-123');
    await user.click(option);

    // Wait for preview step
    expect(await screen.findByText('Delete Selected')).toBeDefined();

    // Select the Observation checkbox
    const obsCheckbox = screen.getByLabelText('Select Observation');
    await user.click(obsCheckbox);

    // Click Delete Selected
    await user.click(screen.getByRole('button', { name: 'Delete Selected' }));

    // Confirm in modal
    expect(await screen.findByText('Confirm Deletion')).toBeDefined();
    expect(screen.getByText(/This action cannot be undone/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    // Should show results
    expect(await screen.findByText('Results')).toBeDefined();
    expect(await screen.findByText(/2 deleted/)).toBeDefined();

    // Should have called deleteResource for each observation
    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenCalledWith('Observation', 'obs-1');
    expect(deleteSpy).toHaveBeenCalledWith('Observation', 'obs-2');
  });
});

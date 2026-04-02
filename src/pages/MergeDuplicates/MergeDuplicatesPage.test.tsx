// ABOUTME: Integration tests for the merge duplicates wizard flow.
// ABOUTME: Verifies the multi-step flow from type selection through to results.
import { MantineProvider } from '@mantine/core';
import type { Bundle, ResourceType } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../../fhir/medplum-adapter';
import { MergeDuplicatesPage } from './MergeDuplicatesPage';

function renderPage(
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({});
  medplumOverrides?.(medplum);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/merge-duplicates']}>
          <MergeDuplicatesPage />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

describe('MergeDuplicatesPage', () => {
  it('renders the select resource type step initially', () => {
    renderPage();
    expect(screen.getByText('Merge Duplicates')).toBeDefined();
    expect(screen.getByPlaceholderText('Select resource type')).toBeDefined();
  });

  it('shows duplicate groups after scanning', async () => {
    const user = userEvent.setup();

    renderPage((medplum) => {
      vi.spyOn(medplum, 'search').mockImplementation(
        (_type: ResourceType) => {
          return Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
              {
                resource: {
                  resourceType: 'Practitioner',
                  id: 'p1',
                  name: [{ family: 'Smith', given: ['John'] }],
                },
              },
              {
                resource: {
                  resourceType: 'Practitioner',
                  id: 'p2',
                  name: [{ family: 'Smyth', given: ['Jon'] }],
                },
              },
            ],
          } as Bundle);
        }
      );
    });

    // Open the select dropdown and pick Practitioner
    const selectInput = screen.getByPlaceholderText('Select resource type');
    await user.click(selectInput);
    const practitionerOption = await screen.findByText('Practitioner');
    await user.click(practitionerOption);

    // Click scan
    const scanButton = screen.getByText('Scan for Duplicates');
    await user.click(scanButton);

    // Should show the groups step with group count
    await waitFor(() => {
      expect(screen.getByText(/group/i)).toBeDefined();
    });
  });

  it('shows no duplicates message when none found', async () => {
    const user = userEvent.setup();

    renderPage((medplum) => {
      vi.spyOn(medplum, 'search').mockImplementation(
        () => {
          return Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
              {
                resource: {
                  resourceType: 'Practitioner',
                  id: 'p1',
                  name: [{ family: 'Smith', given: ['John'] }],
                },
              },
              {
                resource: {
                  resourceType: 'Practitioner',
                  id: 'p2',
                  name: [{ family: 'Jones', given: ['Alice'] }],
                },
              },
            ],
          } as Bundle);
        }
      );
    });

    const selectInput = screen.getByPlaceholderText('Select resource type');
    await user.click(selectInput);
    const practitionerOption = await screen.findByText('Practitioner');
    await user.click(practitionerOption);

    const scanButton = screen.getByText('Scan for Duplicates');
    await user.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText('No duplicates found')).toBeDefined();
    });
  });
});

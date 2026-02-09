// ABOUTME: Tests for the FHIR search results table.
// ABOUTME: Verifies table rendering from a FHIR Bundle searchset.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SearchResultsTable } from './SearchResultsTable';
import type { Bundle, Patient } from '@medplum/fhirtypes';

const mockBundle: Bundle<Patient> = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: '1',
        name: [{ family: 'Smith', given: ['John'] }],
      },
    },
    {
      resource: {
        resourceType: 'Patient',
        id: '2',
        name: [{ family: 'Doe', given: ['Jane'] }],
      },
    },
  ],
};

describe('SearchResultsTable', () => {
  it('renders rows for each bundle entry', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <SearchResultsTable bundle={mockBundle} resourceType="Patient" />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(screen.getByText('John Smith')).toBeDefined();
    expect(screen.getByText('Jane Doe')).toBeDefined();
  });

  it('shows empty state when no entries', () => {
    const emptyBundle: Bundle = { resourceType: 'Bundle', type: 'searchset' };
    render(
      <MantineProvider>
        <MemoryRouter>
          <SearchResultsTable bundle={emptyBundle} resourceType="Patient" />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(screen.getByText(/no results/i)).toBeDefined();
  });
});

// ABOUTME: Tests for the application shell layout.
// ABOUTME: Verifies navigation, resource type list, search input, and route rendering.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HealthcareMedplumClient } from './fhir/medplum-adapter';
import { Shell } from './Shell';

const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });

function renderShell(route = '/'): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[route]}>
          <Shell />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('Shell', () => {
  it('renders app title', () => {
    renderShell();
    expect(screen.getByText('Cinder')).toBeDefined();
  });

  it('shows resource type list on home page', () => {
    renderShell('/');
    expect(screen.getByText('Patient')).toBeDefined();
    expect(screen.getByText('Observation')).toBeDefined();
  });

  it('renders a search input in the header', () => {
    renderShell();
    expect(screen.getByPlaceholderText('Search...')).toBeDefined();
  });

  it('does not contain patient-only search placeholder', () => {
    const { container } = renderShell();
    expect(container.innerHTML).not.toContain('Search patients...');
  });

  it('renders a sidebar filter input', () => {
    renderShell();
    expect(screen.getByPlaceholderText('Filter...')).toBeDefined();
  });
});

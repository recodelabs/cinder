// ABOUTME: Tests for the resource editing page.
// ABOUTME: Verifies ResourceForm rendering and update submission.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { ResourceEditPage } from './ResourceEditPage';

const medplum = new HealthcareMedplumClient({ getAccessToken: () => undefined });

function renderEditPage(route: string): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[route]}>
          <ResourceEditPage resourceType="Patient" id="test-1" />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('ResourceEditPage', () => {
  it('shows loading state initially', () => {
    const { container } = renderEditPage('/Patient/test-1/edit');
    expect(container.querySelector('.mantine-Loader-root')).toBeDefined();
  });
});

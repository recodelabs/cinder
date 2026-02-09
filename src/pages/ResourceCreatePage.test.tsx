// ABOUTME: Tests for the resource creation page.
// ABOUTME: Verifies ResourceForm renders for new resource creation.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { ResourceCreatePage } from './ResourceCreatePage';

const medplum = new HealthcareMedplumClient({ getAccessToken: () => undefined });

function renderCreatePage(): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/Patient/new']}>
          <ResourceCreatePage resourceType="Patient" />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('ResourceCreatePage', () => {
  it('renders ResourceForm with Create button', async () => {
    renderCreatePage();
    expect(await screen.findByRole('button', { name: 'Create' })).toBeDefined();
  });
});

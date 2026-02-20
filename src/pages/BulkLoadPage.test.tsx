// ABOUTME: Tests for the bulk load page component.
// ABOUTME: Verifies multi-step flow: file upload, preview, and upload progress.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { BulkLoadPage } from './BulkLoadPage';

function renderBulkLoadPage(
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({ getAccessToken: () => undefined });
  medplumOverrides?.(medplum);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/bulk-load']}>
          <BulkLoadPage />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

async function createTestZip(): Promise<File> {
  const zip = new JSZip();
  const bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        fullUrl: 'urn:uuid:patient-1',
        resource: {
          resourceType: 'Patient',
          id: 'patient-1',
          name: [{ given: ['Test'], family: 'Patient' }],
        },
      },
      {
        fullUrl: 'urn:uuid:obs-1',
        resource: {
          resourceType: 'Observation',
          id: 'obs-1',
          status: 'final',
          code: { text: 'Heart Rate' },
          subject: { reference: 'urn:uuid:patient-1' },
        },
      },
      {
        fullUrl: 'urn:uuid:cond-1',
        resource: {
          resourceType: 'Condition',
          id: 'cond-1',
          subject: { reference: 'urn:uuid:patient-1' },
          code: { text: 'Hypertension' },
        },
      },
    ],
  };
  zip.file('bundle_0000.json', JSON.stringify(bundle));
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'test-data.zip', { type: 'application/zip' });
}

describe('BulkLoadPage', () => {
  it('renders the upload step initially', () => {
    renderBulkLoadPage();
    expect(screen.getByText('Bulk Load')).toBeDefined();
    expect(screen.getByText('Parse ZIP')).toBeDefined();
  });

  it('parse button is disabled without a file', () => {
    renderBulkLoadPage();
    const btn = screen.getByRole('button', { name: 'Parse ZIP' });
    expect(btn).toHaveProperty('disabled', true);
  });

  it('parses a ZIP file and shows preview', async () => {
    renderBulkLoadPage();
    const user = userEvent.setup();
    const zipFile = await createTestZip();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, zipFile);
    await user.click(screen.getByRole('button', { name: 'Parse ZIP' }));

    expect(await screen.findByText('Contents')).toBeDefined();
    expect(await screen.findByText('Patient')).toBeDefined();
    expect(await screen.findByText('Observation')).toBeDefined();
    expect(await screen.findByText('Condition')).toBeDefined();
  });

  it('uploads resources after selecting a target patient', async () => {
    const createSpy = vi.fn().mockResolvedValue({ resourceType: 'Observation', id: 'new-1' });
    renderBulkLoadPage((medplum) => {
      vi.spyOn(medplum, 'createResource').mockImplementation(createSpy);
      vi.spyOn(medplum, 'search').mockResolvedValue({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              id: 'target-patient',
              name: [{ given: ['Jane'], family: 'Doe' }],
            },
          },
        ],
      });
    });

    const user = userEvent.setup();
    const zipFile = await createTestZip();

    // Upload and parse
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, zipFile);
    await user.click(screen.getByRole('button', { name: 'Parse ZIP' }));

    // Wait for preview
    expect(await screen.findByText('Contents')).toBeDefined();

    // Search for patient
    const patientInput = await screen.findByPlaceholderText('Search by name...');
    await user.type(patientInput, 'Jane');

    // Wait for and select patient from dropdown
    const option = await screen.findByText('Patient/target-patient');
    await user.click(option);

    // Start upload
    await user.click(screen.getByRole('button', { name: 'Start Upload' }));

    // Should show results
    expect(await screen.findByText('Results')).toBeDefined();
    expect(await screen.findByText(/succeeded/)).toBeDefined();

    // Should have called createResource for non-Patient resources (Observation + Condition)
    expect(createSpy).toHaveBeenCalledTimes(2);
  });
});

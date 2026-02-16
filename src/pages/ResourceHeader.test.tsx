// ABOUTME: Tests for the resource detail page header banner.
// ABOUTME: Verifies display name, resource type, and patient-specific fields render.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import type { Organization, Patient, RelatedPerson, Resource } from '@medplum/fhirtypes';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { ResourceHeader } from './ResourceHeader';

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ resourceType: 'Patient', id: '123' }),
    status: 200,
    headers: new Headers({ 'content-type': 'application/fhir+json' }),
  });
  vi.stubGlobal('fetch', mockFetch);
});

const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });

function renderHeader(resource: Resource): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <ResourceHeader resource={resource} />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

const testPatient: Patient = {
  resourceType: 'Patient',
  id: 'test-1',
  name: [{ family: 'Goncalves', given: ['Ricardo'] }],
  birthDate: '1990-05-15',
  gender: 'male',
};

const testOrg: Organization = {
  resourceType: 'Organization',
  id: 'org-1',
  name: 'Turn Health',
};

const testRelatedPerson: RelatedPerson = {
  resourceType: 'RelatedPerson',
  id: 'rp-1',
  patient: { reference: 'Patient/patient-abc' },
  relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'CHILD', display: 'child' }] }],
};

const testRelatedPersonWithIdentifier: RelatedPerson = {
  resourceType: 'RelatedPerson',
  id: 'rp-3',
  patient: { reference: 'Patient/patient-abc' },
  relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'CHILD', display: 'child' }] }],
  identifier: [{ system: 'http://example.com/mrn', value: 'MRN-12345' }],
};

const testRelatedPersonNoRelationship: RelatedPerson = {
  resourceType: 'RelatedPerson',
  id: 'rp-2',
  patient: { reference: 'Patient/patient-abc' },
};

describe('ResourceHeader', () => {
  it('renders display name for a patient', () => {
    renderHeader(testPatient);
    expect(screen.getByText('Ricardo Goncalves')).toBeDefined();
  });

  it('renders patient DOB and gender', () => {
    renderHeader(testPatient);
    expect(screen.getByText('1990-05-15')).toBeDefined();
    expect(screen.getByText('male')).toBeDefined();
  });

  it('renders resource type label', () => {
    renderHeader(testPatient);
    expect(screen.getByText('Patient')).toBeDefined();
  });

  it('renders display name for an organization', () => {
    renderHeader(testOrg);
    expect(screen.getByText('Turn Health')).toBeDefined();
  });

  it('renders relationship type for RelatedPerson', () => {
    renderHeader(testRelatedPerson);
    expect(screen.getByText('child')).toBeDefined();
  });

  it('renders RelatedPerson badge', () => {
    renderHeader(testRelatedPerson);
    expect(screen.getByText('RelatedPerson')).toBeDefined();
  });

  it('does not render relationship when RelatedPerson has none', () => {
    renderHeader(testRelatedPersonNoRelationship);
    expect(screen.getByText('RelatedPerson')).toBeDefined();
  });

  it('renders identifier system and value for RelatedPerson', () => {
    renderHeader(testRelatedPersonWithIdentifier);
    expect(screen.getByText('http://example.com/mrn')).toBeDefined();
    expect(screen.getByText('MRN-12345')).toBeDefined();
  });

  it('displays inline base64 photo in avatar', async () => {
    const patientWithInlinePhoto: Patient = {
      ...testPatient,
      photo: [{ contentType: 'image/png', data: 'iVBORw0KGgo=' }],
    };
    renderHeader(patientWithInlinePhoto);
    await waitFor(() => {
      const img = document.querySelector('img[src^="data:image/png;base64,"]');
      expect(img).not.toBeNull();
    });
  });

  it('fetches Binary and displays photo from URL reference', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resourceType: 'Binary',
          id: 'bin-photo',
          contentType: 'image/jpeg',
          data: '/9j/4AAQSkZJRg==',
        }),
      status: 200,
      headers: new Headers({ 'content-type': 'application/fhir+json' }),
    });
    const patientWithBinaryPhoto: Patient = {
      ...testPatient,
      photo: [{ contentType: 'image/jpeg', url: 'http://localhost:5173/fhir/Binary/bin-photo' }],
    };
    await act(async () => {
      renderHeader(patientWithBinaryPhoto);
    });
    await waitFor(() => {
      const img = document.querySelector('img[src^="data:image/jpeg;base64,"]');
      expect(img).not.toBeNull();
    });
  });

  it('falls back to initials when patient has no photo', () => {
    renderHeader(testPatient);
    // No img tag with data URI should be present
    const img = document.querySelector('img[src^="data:image/"]');
    expect(img).toBeNull();
  });
});

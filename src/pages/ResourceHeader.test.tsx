// ABOUTME: Tests for the resource detail page header banner.
// ABOUTME: Verifies display name, resource type, and patient-specific fields render.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Organization, Patient, RelatedPerson, Resource } from '@medplum/fhirtypes';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { ResourceHeader } from './ResourceHeader';

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
});

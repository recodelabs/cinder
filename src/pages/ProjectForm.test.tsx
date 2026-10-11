// ABOUTME: Tests for the shared project form.
// ABOUTME: Verifies server-type switching, conditional fields, client-credential fields, and submitted values.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectForm, projectRequestBody, type ProjectFormValues } from './ProjectForm';

function renderForm(initialValues?: Partial<ProjectFormValues>, clientSecretSet?: boolean) {
  const onSubmit = vi.fn((_values: ProjectFormValues) => Promise.resolve());
  render(
    <MantineProvider>
      <ProjectForm
        title="Create Project"
        submitLabel="Create"
        initialValues={initialValues}
        clientSecretSet={clientSecretSet}
        onSubmit={onSubmit}
      />
    </MantineProvider>
  );
  return onSubmit;
}

describe('ProjectForm', () => {
  it('shows GCP fields by default', () => {
    renderForm();
    expect(screen.getByLabelText(/GCP Project/)).toBeDefined();
    expect(screen.queryByLabelText(/FHIR base URL/)).toBeNull();
  });

  it('switches to a FHIR base URL field and submits a fhir project', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.type(screen.getByLabelText(/^Name/), 'Local HAPI');
    await user.click(screen.getByRole('radio', { name: /FHIR server/ }));
    expect(screen.queryByLabelText(/GCP Project/)).toBeNull();

    const submit = screen.getByRole('button', { name: 'Create' });
    expect(submit).toHaveProperty('disabled', true);

    await user.type(screen.getByLabelText(/FHIR base URL/), 'http://localhost:3447/fhir');
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Local HAPI', serverType: 'fhir', fhirBaseUrl: 'http://localhost:3447/fhir' })
    );
  });

  it('starts on the fhir type when editing a fhir project', () => {
    renderForm({ name: 'HAPI', serverType: 'fhir', fhirBaseUrl: 'http://localhost:3447/fhir' });
    expect(screen.getByLabelText(/FHIR base URL/)).toHaveProperty('value', 'http://localhost:3447/fhir');
  });

  it('collects client credentials for a FHIR server behind a token gateway', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ name: 'Gateway', serverType: 'fhir', fhirBaseUrl: 'https://gateway.example.org/fhir' });

    expect(screen.queryByLabelText(/Token URL/)).toBeNull();
    await user.click(screen.getByRole('switch', { name: /OAuth client credentials/ }));

    const submit = screen.getByRole('button', { name: 'Create' });
    await user.type(screen.getByLabelText(/Token URL/), 'https://auth.example.org/token');
    await user.type(screen.getByLabelText(/Client ID/), 'key-demo');
    expect(submit).toHaveProperty('disabled', true);

    await user.type(screen.getByLabelText(/Client secret/), 'shh');
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        fhirAuthEnabled: true,
        tokenUrl: 'https://auth.example.org/token',
        clientId: 'key-demo',
        clientSecret: 'shh',
      })
    );
  });

  it('lets an edit keep the saved secret by leaving it blank', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(
      {
        name: 'Gateway',
        serverType: 'fhir',
        fhirBaseUrl: 'https://gateway.example.org/fhir',
        fhirAuthEnabled: true,
        tokenUrl: 'https://auth.example.org/token',
        clientId: 'key-demo',
      },
      true
    );

    expect(screen.getByLabelText(/Client secret/)).toHaveProperty('value', '');
    expect(screen.getByText(/A secret is saved/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fhirAuthEnabled: true, clientSecret: '' }));
  });
});

describe('projectRequestBody', () => {
  const values: ProjectFormValues = {
    name: 'Gateway',
    description: '',
    serverType: 'fhir',
    fhirBaseUrl: 'https://gateway.example.org/fhir',
    fhirAuthEnabled: true,
    tokenUrl: ' https://auth.example.org/token ',
    clientId: 'key-demo',
    clientSecret: '',
    gcpProject: '',
    gcpLocation: '',
    gcpDataset: '',
    gcpFhirStore: '',
  };

  it('omits a blank secret so the server keeps the saved one', () => {
    expect(projectRequestBody(values).fhirAuth).toEqual({ tokenUrl: 'https://auth.example.org/token', clientId: 'key-demo' });
  });

  it('sends the secret when one is entered', () => {
    expect(projectRequestBody({ ...values, clientSecret: 'shh' }).fhirAuth).toEqual({
      tokenUrl: 'https://auth.example.org/token',
      clientId: 'key-demo',
      clientSecret: 'shh',
    });
  });

  it('sends null when authentication is off', () => {
    expect(projectRequestBody({ ...values, fhirAuthEnabled: false }).fhirAuth).toBeNull();
  });

  it('sends no credential fields for Google Cloud Healthcare projects', () => {
    const body = projectRequestBody({ ...values, serverType: 'gcp', gcpProject: 'p', gcpLocation: 'l', gcpDataset: 'd', gcpFhirStore: 's' });
    expect(body).not.toHaveProperty('fhirAuth');
    expect(body).not.toHaveProperty('clientSecret');
    expect(body).toMatchObject({ serverType: 'gcp', gcpProject: 'p', gcpFhirStore: 's' });
  });
});

// ABOUTME: Tests for the shared project form.
// ABOUTME: Verifies server-type switching, conditional fields, and submitted values.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectForm, type ProjectFormValues } from './ProjectForm';

function renderForm(initialValues?: Partial<ProjectFormValues>) {
  const onSubmit = vi.fn(() => Promise.resolve());
  render(
    <MantineProvider>
      <ProjectForm title="Create Project" submitLabel="Create" initialValues={initialValues} onSubmit={onSubmit} />
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
});

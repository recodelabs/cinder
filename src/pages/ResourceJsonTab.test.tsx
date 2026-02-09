// ABOUTME: Tests for the JSON editor tab on the resource detail page.
// ABOUTME: Verifies JSON rendering and save functionality.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Patient } from '@medplum/fhirtypes';
import { ResourceJsonTab } from './ResourceJsonTab';

const testPatient: Patient = {
  resourceType: 'Patient',
  id: 'test-1',
  name: [{ family: 'Smith', given: ['John'] }],
};

describe('ResourceJsonTab', () => {
  it('renders JSON content of the resource', () => {
    render(
      <MantineProvider>
        <ResourceJsonTab resource={testPatient} onSubmit={vi.fn()} />
      </MantineProvider>
    );
    expect(screen.getByTestId('resource-json')).toBeDefined();
    const textarea = screen.getByRole('textbox');
    expect(textarea.textContent || (textarea as HTMLTextAreaElement).value).toContain('"Patient"');
  });

  it('renders the OK button', () => {
    render(
      <MantineProvider>
        <ResourceJsonTab resource={testPatient} onSubmit={vi.fn()} />
      </MantineProvider>
    );
    expect(screen.getByRole('button', { name: 'OK' })).toBeDefined();
  });

  it('calls onSubmit with parsed JSON when OK is clicked', async () => {
    const onSubmit = vi.fn();
    render(
      <MantineProvider>
        <ResourceJsonTab resource={testPatient} onSubmit={onSubmit} />
      </MantineProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSubmit).toHaveBeenCalledWith(testPatient);
  });
});

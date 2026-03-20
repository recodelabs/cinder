// ABOUTME: Tests for the Extraction tab component on Questionnaire detail pages.
// ABOUTME: Verifies template editing, saving, and test extraction functionality.
import { MantineProvider } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { EXTRACTION_EXTENSION_URL } from '../fhir/extraction-helpers';
import { ExtractionTab } from './ExtractionTab';

function renderTab(
  questionnaire: Questionnaire,
  onSave = vi.fn(),
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void,
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({});
  medplumOverrides?.(medplum);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <ExtractionTab questionnaire={questionnaire} onSave={onSave} />
      </MedplumProvider>
    </MantineProvider>,
  );
  return { ...result, medplum };
}

/** Helper to set a textarea value via fireEvent (avoids userEvent special char issues with { and [). */
function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  fireEvent.change(textarea, { target: { value } });
}

describe('ExtractionTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders section titles', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q);
    expect(screen.getByText('Extraction Template')).toBeDefined();
    expect(screen.getByText('Test Extraction')).toBeDefined();
  });

  it('renders with existing template pre-filled in the textarea', () => {
    const template = [{ resourceType: 'Patient' }];
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      extension: [
        { url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(template) },
      ],
    };
    renderTab(q);
    const textareas = document.querySelectorAll('textarea');
    const templateTextarea = textareas[0] as HTMLTextAreaElement;
    expect(templateTextarea.value).toContain('Patient');
  });

  it('renders with empty textarea when no template exists', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q);
    const textareas = document.querySelectorAll('textarea');
    const templateTextarea = textareas[0] as HTMLTextAreaElement;
    expect(templateTextarea.value).toBe('');
  });

  it('renders Save Template button', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q);
    expect(screen.getByRole('button', { name: 'Save Template' })).toBeDefined();
  });

  it('Save Template button is disabled when textarea is empty', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q);
    const saveBtn = screen.getByRole('button', { name: 'Save Template' });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows Invalid JSON error when saving invalid JSON', async () => {
    const user = userEvent.setup();
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q);

    const textareas = document.querySelectorAll('textarea');
    const templateTextarea = textareas[0] as HTMLTextAreaElement;
    setTextareaValue(templateTextarea, 'not valid json');

    await user.click(screen.getByRole('button', { name: 'Save Template' }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid JSON/i)).toBeDefined();
    });
  });

  it('shows error when template is valid JSON but not an array', async () => {
    const user = userEvent.setup();
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q);

    const textareas = document.querySelectorAll('textarea');
    const templateTextarea = textareas[0] as HTMLTextAreaElement;
    setTextareaValue(templateTextarea, '{"resourceType":"Patient"}');

    await user.click(screen.getByRole('button', { name: 'Save Template' }));

    await waitFor(() => {
      expect(screen.getByText(/must be a JSON array/i)).toBeDefined();
    });
  });

  it('calls updateResource and onSave when saving valid template', async () => {
    const user = userEvent.setup();
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'q-1',
      status: 'active',
    };
    const onSave = vi.fn();
    const updatedQ: Questionnaire = {
      ...q,
      extension: [{ url: EXTRACTION_EXTENSION_URL, valueString: '[{"resourceType":"Patient"}]' }],
    };

    const { medplum } = renderTab(q, onSave, (m) => {
      vi.spyOn(m, 'updateResource').mockResolvedValue(updatedQ);
    });

    const textareas = document.querySelectorAll('textarea');
    const templateTextarea = textareas[0] as HTMLTextAreaElement;
    setTextareaValue(templateTextarea, '[{"resourceType":"Patient"}]');

    await user.click(screen.getByRole('button', { name: 'Save Template' }));

    await waitFor(() => {
      expect(vi.mocked(medplum.updateResource)).toHaveBeenCalled();
      expect(onSave).toHaveBeenCalledWith(updatedQ);
    });
  });

  it('shows Saved message after successful save', async () => {
    const user = userEvent.setup();
    const q: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'q-2',
      status: 'active',
    };
    const updatedQ: Questionnaire = { ...q };

    renderTab(q, vi.fn(), (m) => {
      vi.spyOn(m, 'updateResource').mockResolvedValue(updatedQ);
    });

    const textareas = document.querySelectorAll('textarea');
    const templateTextarea = textareas[0] as HTMLTextAreaElement;
    setTextareaValue(templateTextarea, '[{"resourceType":"Patient"}]');
    await user.click(screen.getByRole('button', { name: 'Save Template' }));

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeDefined();
    });
  });

  it('Test button is disabled when QR ID or template is empty', () => {
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q);
    const testBtn = screen.getByRole('button', { name: 'Test' });
    expect((testBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows test error when readResource fails', async () => {
    const user = userEvent.setup();
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    renderTab(q, vi.fn(), (m) => {
      vi.spyOn(m, 'readResource').mockRejectedValue(new Error('Not found'));
    });

    const textareas = document.querySelectorAll('textarea');
    const templateTextarea = textareas[0] as HTMLTextAreaElement;
    setTextareaValue(templateTextarea, '[{"resourceType":"Patient"}]');

    const qrInput = screen.getByPlaceholderText('QuestionnaireResponse ID');
    await user.type(qrInput, 'qr-123');

    await user.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() => {
      expect(screen.getByText(/Not found/i)).toBeDefined();
    });
  });

  it('shows extraction results when test succeeds', async () => {
    const user = userEvent.setup();
    const q: Questionnaire = { resourceType: 'Questionnaire', status: 'active' };
    const mockQR: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      id: 'qr-123',
      status: 'completed',
      questionnaire: 'Questionnaire/q-1',
    };

    renderTab(q, vi.fn(), (m) => {
      vi.spyOn(m, 'readResource').mockResolvedValue(mockQR);
    });

    const textareas = document.querySelectorAll('textarea');
    const templateTextarea = textareas[0] as HTMLTextAreaElement;
    setTextareaValue(templateTextarea, '[{"resourceType":"Patient"}]');

    const qrInput = screen.getByPlaceholderText('QuestionnaireResponse ID');
    await user.type(qrInput, 'qr-123');

    await user.click(screen.getByRole('button', { name: 'Test' }));

    // Result should be displayed (empty array since no matching fields)
    await waitFor(() => {
      expect(screen.getByText(/\[\]/)).toBeDefined();
    });
  });
});

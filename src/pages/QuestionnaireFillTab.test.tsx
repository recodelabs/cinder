// ABOUTME: Tests for the QuestionnaireFillTab component.
// ABOUTME: Verifies rendering, submission, navigation, and error handling.
import { MantineProvider } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { QuestionnaireFillTab } from './QuestionnaireFillTab';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@formbox/renderer', () => ({
  default: function MockRenderer({ onSubmit }: { onSubmit?: (response: unknown) => void }) {
    return (
      <div data-testid="formbox-renderer">
        <button onClick={() => onSubmit?.({ resourceType: 'QuestionnaireResponse', item: [] })}>
          Mock Submit
        </button>
      </div>
    );
  },
}));
vi.mock('@formbox/mantine-theme/style.css', () => ({}));

const sampleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'q-123',
  status: 'active',
  item: [
    {
      linkId: '1',
      text: 'What is your name?',
      type: 'string',
    },
  ],
};

function renderTab(
  questionnaire: Questionnaire = sampleQuestionnaire,
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({});
  medplumOverrides?.(medplum);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <QuestionnaireFillTab questionnaire={questionnaire} />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

describe('QuestionnaireFillTab', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders the formbox renderer', () => {
    renderTab();
    expect(screen.getByTestId('formbox-renderer')).toBeDefined();
  });

  it('creates a QuestionnaireResponse and navigates on submit', async () => {
    const user = userEvent.setup();

    renderTab(sampleQuestionnaire, (medplum) => {
      vi.spyOn(medplum, 'createResource').mockResolvedValue({
        resourceType: 'QuestionnaireResponse',
        id: 'qr-456',
        status: 'completed',
      } as QuestionnaireResponse);
    });

    await user.click(screen.getByText('Mock Submit'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/QuestionnaireResponse/qr-456');
    });
  });

  it('passes correct fields in the created QuestionnaireResponse', async () => {
    const user = userEvent.setup();
    const createSpy = vi.fn().mockResolvedValue({
      resourceType: 'QuestionnaireResponse',
      id: 'qr-789',
      status: 'completed',
    } as QuestionnaireResponse);

    renderTab(sampleQuestionnaire, (medplum) => {
      vi.spyOn(medplum, 'createResource').mockImplementation(createSpy);
    });

    await user.click(screen.getByText('Mock Submit'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    const created = createSpy.mock.calls[0][0] as QuestionnaireResponse;
    expect(created.resourceType).toBe('QuestionnaireResponse');
    expect(created.questionnaire).toBe('Questionnaire/q-123');
    expect(created.status).toBe('completed');
  });

  it('displays an error when createResource fails', async () => {
    const user = userEvent.setup();

    renderTab(sampleQuestionnaire, (medplum) => {
      vi.spyOn(medplum, 'createResource').mockRejectedValue(
        new Error('Failed to create resource')
      );
    });

    await user.click(screen.getByText('Mock Submit'));

    await waitFor(() => {
      expect(screen.getByTestId('error-alert')).toBeDefined();
    });

    expect(screen.getByText('Failed to create resource')).toBeDefined();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not show error alert initially', () => {
    renderTab();
    expect(screen.queryByTestId('error-alert')).toBeNull();
  });
});

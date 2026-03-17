// ABOUTME: Tests for the QuestionnaireResponseViewTab component.
// ABOUTME: Verifies fetching, loading states, display mode rendering, and error handling.
import { MantineProvider } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { QuestionnaireResponseViewTab } from './QuestionnaireResponseViewTab';

vi.mock('@formbox/renderer', () => ({
  default: function MockRenderer(props: { mode?: string }) {
    return (
      <div data-testid="formbox-renderer" data-mode={props.mode}>
        Mock Renderer
      </div>
    );
  },
}));
vi.mock('@formbox/mantine-theme/style.css', () => ({}));

const sampleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'q-123',
  status: 'active',
  item: [{ linkId: '1', text: 'What is your name?', type: 'string' }],
};

const sampleResponse: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  id: 'qr-456',
  status: 'completed',
  questionnaire: 'Questionnaire/q-123',
  item: [{ linkId: '1', answer: [{ valueString: 'Alice' }] }],
};

function renderTab(
  questionnaireResponse: QuestionnaireResponse = sampleResponse,
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void
): { medplum: HealthcareMedplumClient } & ReturnType<typeof render> {
  const medplum = new HealthcareMedplumClient({});
  medplumOverrides?.(medplum);
  const result = render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <QuestionnaireResponseViewTab questionnaireResponse={questionnaireResponse} />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return { ...result, medplum };
}

describe('QuestionnaireResponseViewTab', () => {
  it('fetches the questionnaire from the response reference', async () => {
    const readSpy = vi.fn().mockResolvedValue(sampleQuestionnaire);

    renderTab(sampleResponse, (medplum) => {
      vi.spyOn(medplum, 'readResource').mockImplementation(readSpy);
    });

    await waitFor(() => {
      expect(readSpy).toHaveBeenCalledWith('Questionnaire', 'q-123');
    });
  });

  it('shows a loader while fetching', async () => {
    let resolveRead!: (value: Questionnaire) => void;
    const readPromise = new Promise<Questionnaire>((resolve) => {
      resolveRead = resolve;
    });

    renderTab(sampleResponse, (medplum) => {
      vi.spyOn(medplum, 'readResource').mockReturnValue(readPromise);
    });

    expect(screen.getByTestId('loader')).toBeDefined();

    await act(async () => {
      resolveRead(sampleQuestionnaire);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('loader')).toBeNull();
    });
  });

  it('renders in display mode after fetch completes', async () => {
    renderTab(sampleResponse, (medplum) => {
      vi.spyOn(medplum, 'readResource').mockResolvedValue(sampleQuestionnaire);
    });

    await waitFor(() => {
      expect(screen.getByTestId('formbox-renderer')).toBeDefined();
    });

    expect(screen.getByTestId('formbox-renderer').getAttribute('data-mode')).toBe('display');
  });

  it('shows an error when the questionnaire reference is missing', async () => {
    const noRef: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      id: 'qr-no-ref',
      status: 'completed',
    };

    renderTab(noRef);

    await waitFor(() => {
      expect(screen.getByTestId('error-alert')).toBeDefined();
    });

    expect(
      screen.getByText('QuestionnaireResponse does not reference a Questionnaire')
    ).toBeDefined();
  });

  it('shows an error when the fetch fails', async () => {
    renderTab(sampleResponse, (medplum) => {
      vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('Not found'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-alert')).toBeDefined();
    });

    expect(screen.getByText('Not found')).toBeDefined();
  });
});

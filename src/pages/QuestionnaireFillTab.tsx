// ABOUTME: Renders a FHIR Questionnaire as an interactive form using formbox-renderer.
// ABOUTME: On submit, creates a QuestionnaireResponse resource and navigates to it.
import { Alert, Stack } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { QuestionnaireOf, QuestionnaireResponseOf } from '@formbox/fhir';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { safeErrorMessage } from '../errors';
import Renderer from '@formbox/renderer';
import { theme as formboxTheme } from '@formbox/mantine-theme';
import '@formbox/mantine-theme/style.css';

interface QuestionnaireFillTabProps {
  readonly questionnaire: Questionnaire;
}

export function QuestionnaireFillTab({ questionnaire }: QuestionnaireFillTabProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [error, setError] = useState<Error>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    (response: QuestionnaireResponseOf<'r4'>) => {
      setError(undefined);
      setSubmitting(true);

      const questionnaireResponse: QuestionnaireResponse = {
        ...(response as unknown as QuestionnaireResponse),
        resourceType: 'QuestionnaireResponse',
        questionnaire: `Questionnaire/${questionnaire.id}`,
        status: 'completed',
      };

      medplum
        .createResource(questionnaireResponse)
        .then((created) => navigate(`/${created.resourceType}/${created.id}`))
        .catch((err: unknown) => {
          setSubmitting(false);
          setError(err instanceof Error ? err : new Error(String(err)));
        });
    },
    [medplum, navigate, questionnaire.id]
  );

  return (
    <Stack>
      {error && (
        <Alert color="red" data-testid="error-alert">
          {safeErrorMessage(error)}
        </Alert>
      )}
      <Renderer
        questionnaire={questionnaire as unknown as QuestionnaireOf<'r4'>}
        onSubmit={handleSubmit}
        fhirVersion="r4"
        theme={formboxTheme}
        mode={submitting ? 'display' : 'capture'}
        terminologyServerUrl="https://tx.fhir.org/r4"
      />
    </Stack>
  );
}

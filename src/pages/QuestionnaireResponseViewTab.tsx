// ABOUTME: Displays a completed QuestionnaireResponse in read-only mode using formbox-renderer.
// ABOUTME: Fetches the referenced Questionnaire resource to provide the form structure.
import { Alert, Loader, Stack } from '@mantine/core';
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { QuestionnaireOf, QuestionnaireResponseOf } from '@formbox/fhir';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { safeErrorMessage } from '../errors';
import Renderer from '@formbox/renderer';
import { theme as formboxTheme } from '@formbox/mantine-theme';
import '@formbox/mantine-theme/style.css';
import type { Questionnaire } from '@medplum/fhirtypes';

interface QuestionnaireResponseViewTabProps {
  readonly questionnaireResponse: QuestionnaireResponse;
}

function parseQuestionnaireId(reference: string | undefined): string | undefined {
  if (!reference) return undefined;
  const match = /^Questionnaire\/(.+)$/.exec(reference);
  return match?.[1];
}

export function QuestionnaireResponseViewTab({
  questionnaireResponse,
}: QuestionnaireResponseViewTabProps): JSX.Element {
  const medplum = useMedplum();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const questionnaireRef = questionnaireResponse.questionnaire;
  const questionnaireId = parseQuestionnaireId(questionnaireRef);

  useEffect(() => {
    if (!questionnaireId) {
      setError(new Error('QuestionnaireResponse does not reference a Questionnaire'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);

    medplum
      .readResource('Questionnaire', questionnaireId)
      .then((q) => {
        setQuestionnaire(q);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
  }, [medplum, questionnaireId]);

  if (error) {
    return (
      <Stack>
        <Alert color="red" data-testid="error-alert">
          {safeErrorMessage(error)}
        </Alert>
      </Stack>
    );
  }

  if (loading) {
    return <Loader data-testid="loader" />;
  }

  return (
    <Stack>
      <Renderer
        questionnaire={questionnaire as unknown as QuestionnaireOf<'r4'>}
        defaultQuestionnaireResponse={
          questionnaireResponse as unknown as QuestionnaireResponseOf<'r4'>
        }
        fhirVersion="r4"
        theme={formboxTheme}
        mode="display"
      />
    </Stack>
  );
}

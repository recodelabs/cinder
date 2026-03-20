// ABOUTME: Renders a FHIR Questionnaire as an interactive form using formbox-renderer.
// ABOUTME: On submit, creates a QuestionnaireResponse resource and navigates to it.
import { Alert, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Questionnaire, QuestionnaireResponse, Resource } from '@medplum/fhirtypes';
import { getExtractionTemplate, runExtraction } from '../fhir/extraction-helpers';
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
        .then(async (created) => {
          // Run extraction if template is configured
          try {
            const template = getExtractionTemplate(questionnaire);
            if (template) {
              const resources = runExtraction(questionnaire, created as QuestionnaireResponse);
              const results: Array<{ resourceType: string; id?: string; error?: string }> = [];

              for (const resource of resources) {
                try {
                  const saved = await medplum.createResource(resource as unknown as Resource);
                  results.push({ resourceType: saved.resourceType, id: saved.id });
                } catch (err) {
                  results.push({
                    resourceType: (resource as Record<string, unknown>).resourceType as string ?? 'Unknown',
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              }

              if (results.length > 0) {
                const successes = results.filter((r) => r.id);
                const failures = results.filter((r) => r.error);

                notifications.show({
                  title: `Extracted ${successes.length} resource${successes.length !== 1 ? 's' : ''}`,
                  message: [
                    ...successes.map((r) => `${r.resourceType}/${r.id}`),
                    ...failures.map((r) => `Failed: ${r.resourceType} — ${r.error}`),
                  ].join('\n'),
                  color: failures.length > 0 ? 'yellow' : 'green',
                  autoClose: 8000,
                });
              }
            }
          } catch (extractErr) {
            notifications.show({
              title: 'Extraction failed',
              message: extractErr instanceof Error ? extractErr.message : String(extractErr),
              color: 'red',
              autoClose: 8000,
            });
          }

          navigate(`/${created.resourceType}/${created.id}`);
        })
        .catch((err: unknown) => {
          setSubmitting(false);
          setError(err instanceof Error ? err : new Error(String(err)));
        });
    },
    [medplum, navigate, questionnaire.id, questionnaire],
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

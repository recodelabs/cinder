// ABOUTME: Standalone page for filling a Questionnaire, used from the Capture section.
// ABOUTME: Fetches the Questionnaire by ID and renders the fill form directly.
import { Alert, Loader, Stack } from '@mantine/core';
import type { Questionnaire } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { safeErrorMessage } from '../errors';
import { QuestionnaireFillTab } from './QuestionnaireFillTab';

export function CaptureFillPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const medplum = useMedplum();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(undefined);
    medplum
      .readResource('Questionnaire', id)
      .then((q) => setQuestionnaire(q as Questionnaire))
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setLoading(false));
  }, [medplum, id]);

  return (
    <Stack>
      {loading && <Loader />}
      {error && <Alert color="red">{safeErrorMessage(error)}</Alert>}
      {questionnaire && <QuestionnaireFillTab questionnaire={questionnaire} />}
    </Stack>
  );
}

// ABOUTME: Lists available Questionnaires as fillable forms for data capture.
// ABOUTME: Provides a simple UI for selecting and filling out questionnaires.
import { Alert, Card, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconClipboard } from '@tabler/icons-react';
import type { Bundle, Questionnaire } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { safeErrorMessage } from '../errors';

export function CapturePage(): JSX.Element {
  const medplum = useMedplum();
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    medplum
      .search('Questionnaire', { status: 'active', _count: '100', _sort: 'name' })
      .then((bundle: Bundle) => {
        const items = (bundle.entry ?? [])
          .map((e) => e.resource as Questionnaire)
          .filter(Boolean);
        setQuestionnaires(items);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setLoading(false));
  }, [medplum]);

  return (
    <Stack>
      <Title order={2}>Capture</Title>
      <Text c="dimmed">Select a questionnaire to fill out.</Text>
      {loading && <Loader />}
      {error && <Alert color="red">{safeErrorMessage(error)}</Alert>}
      {!loading && questionnaires.length === 0 && !error && (
        <Text c="dimmed">No active questionnaires found.</Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {questionnaires.map((q) => (
          <Card
            key={q.id}
            component={Link}
            to={`/capture/${q.id}`}
            shadow="sm"
            padding="lg"
            withBorder
            style={{ textDecoration: 'none' }}
          >
            <Group gap="sm" wrap="nowrap">
              <IconClipboard size={20} style={{ color: '#868e96', flexShrink: 0 }} />
              <Stack gap={2}>
                <Text fw={500}>{q.title ?? q.name ?? q.id}</Text>
                {q.description && (
                  <Text size="xs" c="dimmed" lineClamp={2}>{q.description}</Text>
                )}
              </Stack>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

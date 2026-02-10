// ABOUTME: Displays RelatedPerson resources linked to a Patient.
// ABOUTME: Queries RelatedPerson?patient={id} and renders a list with relationship type and link.
import { Anchor, Loader, Paper, Stack, Text } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import type { Bundle, RelatedPerson } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

interface PatientRelationshipsProps {
  readonly patientId: string;
}

export function PatientRelationships({ patientId }: PatientRelationshipsProps): JSX.Element {
  const medplum = useMedplum();
  const [relationships, setRelationships] = useState<RelatedPerson[]>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    medplum
      .search('RelatedPerson', 'patient=' + patientId)
      .then((bundle: Bundle) => {
        const entries = (bundle.entry ?? [])
          .map((e) => e.resource as RelatedPerson)
          .filter(Boolean);
        setRelationships(entries);
      })
      .catch(() => setRelationships([]))
      .finally(() => setLoading(false));
  }, [medplum, patientId]);

  if (loading) {
    return <Loader size="sm" />;
  }

  if (!relationships || relationships.length === 0) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed">No relationships found</Text>
      </Paper>
    );
  }

  return (
    <Paper p="md" withBorder>
      <Stack gap="xs">
        <Text fw={600}>Relationships</Text>
        {relationships.map((rp) => {
          const relationshipType = rp.relationship?.[0]?.coding?.[0]?.display ?? 'related';
          return (
            <Text key={rp.id} size="sm">
              {relationshipType} &mdash;{' '}
              <Anchor component={Link} to={`/RelatedPerson/${rp.id}`}>
                {getDisplayString(rp)}
              </Anchor>
            </Text>
          );
        })}
      </Stack>
    </Paper>
  );
}

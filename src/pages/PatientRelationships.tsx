// ABOUTME: Displays RelatedPerson resources linked to a Patient.
// ABOUTME: Resolves linked patient identifiers to show patient names with links.
import { Anchor, Loader, Paper, Stack, Text } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import type { Bundle, Patient, RelatedPerson } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

const LINKED_PATIENT_SYSTEM = 'http://example.org/fhir/related-person-patient';

interface PatientRelationshipsProps {
  readonly patientId: string;
}

interface ResolvedRelationship {
  readonly rp: RelatedPerson;
  readonly relationshipDisplay: string;
  readonly linkedPatient?: Patient;
}

function getLinkedPatientId(rp: RelatedPerson): string | undefined {
  return rp.identifier?.find((id) => id.system === LINKED_PATIENT_SYSTEM)?.value;
}

function getRelationshipDisplay(rp: RelatedPerson): string {
  const coding = rp.relationship?.[0]?.coding?.[0];
  return coding?.display ?? coding?.code ?? 'related';
}

export function PatientRelationships({ patientId }: PatientRelationshipsProps): JSX.Element {
  const medplum = useMedplum();
  const [resolved, setResolved] = useState<ResolvedRelationship[]>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    medplum
      .search('RelatedPerson', 'patient=' + patientId)
      .then(async (bundle: Bundle) => {
        const entries = (bundle.entry ?? [])
          .map((e) => e.resource as RelatedPerson)
          .filter(Boolean);

        const results: ResolvedRelationship[] = await Promise.all(
          entries.map(async (rp) => {
            const linkedId = getLinkedPatientId(rp);
            let linkedPatient: Patient | undefined;
            if (linkedId) {
              try {
                linkedPatient = await medplum.readResource('Patient', linkedId) as Patient;
              } catch {
                // Linked patient not found — fall back to RP display
              }
            }
            return {
              rp,
              relationshipDisplay: getRelationshipDisplay(rp),
              linkedPatient,
            };
          })
        );
        setResolved(results);
      })
      .catch(() => setResolved([]))
      .finally(() => setLoading(false));
  }, [medplum, patientId]);

  if (loading) {
    return <Loader size="sm" />;
  }

  if (!resolved || resolved.length === 0) {
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
        {resolved.map(({ rp, relationshipDisplay, linkedPatient }) => (
          <Text key={rp.id} size="sm">
            {relationshipDisplay} &mdash;{' '}
            {linkedPatient ? (
              <Anchor component={Link} to={`/Patient/${linkedPatient.id}`}>
                {getDisplayString(linkedPatient)}
              </Anchor>
            ) : (
              <Anchor component={Link} to={`/RelatedPerson/${rp.id}`}>
                {getDisplayString(rp)}
              </Anchor>
            )}
          </Text>
        ))}
      </Stack>
    </Paper>
  );
}

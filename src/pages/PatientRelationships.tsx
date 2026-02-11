// ABOUTME: Displays and manages RelatedPerson resources linked to a Patient.
// ABOUTME: Includes inline form for creating bidirectional relationship pairs.
import { Anchor, Autocomplete, Button, Group, Loader, Select, Stack, Text, useCombobox } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import type { Bundle, Patient, RelatedPerson, Resource } from '@medplum/fhirtypes';
import { FormSection } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { IconCirclePlus } from '@tabler/icons-react';

const LINKED_PATIENT_SYSTEM = 'http://example.org/fhir/related-person-patient';
const ROLE_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-RoleCode';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RELATIONSHIP_TYPES = [
  { value: 'CHILD', label: 'Parent of', inverse: { code: 'PRN', display: 'Child of' } },
  { value: 'PRN', label: 'Child of', inverse: { code: 'CHILD', display: 'Parent of' } },
] as const;

interface RelationshipCreator {
  createResource: <T extends Resource>(resource: T) => Promise<T & { id: string }>;
}

export async function createBidirectionalRelationship(
  client: RelationshipCreator,
  subjectPatientId: string,
  targetPatientId: string,
  relationshipCode: string
): Promise<void> {
  const type = RELATIONSHIP_TYPES.find((t) => t.value === relationshipCode);
  if (!type) {
    throw new Error(`Unknown relationship code: ${relationshipCode}`);
  }
  await client.createResource<RelatedPerson>({
    resourceType: 'RelatedPerson',
    patient: { reference: `Patient/${subjectPatientId}` },
    relationship: [{ coding: [{ system: ROLE_CODE_SYSTEM, code: type.value, display: type.label }] }],
    identifier: [{ system: LINKED_PATIENT_SYSTEM, value: targetPatientId }],
  });
  await client.createResource<RelatedPerson>({
    resourceType: 'RelatedPerson',
    patient: { reference: `Patient/${targetPatientId}` },
    relationship: [{ coding: [{ system: ROLE_CODE_SYSTEM, code: type.inverse.code, display: type.inverse.display }] }],
    identifier: [{ system: LINKED_PATIENT_SYSTEM, value: subjectPatientId }],
  });
}

interface PatientRelationshipsProps {
  readonly patientId: string;
  readonly readonly?: boolean;
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

interface AddRelationshipFormProps {
  readonly patientId: string;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

function AddRelationshipForm({ patientId, onSaved, onCancel }: AddRelationshipFormProps): JSX.Element {
  const medplum = useMedplum();
  const [relationshipType, setRelationshipType] = useState<string>(RELATIONSHIP_TYPES[0].value);
  const [searchValue, setSearchValue] = useState('');
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const searchPatients = useDebouncedCallback(async (q: string) => {
    if (!q.trim()) {
      setOptions([]);
      combobox.closeDropdown();
      return;
    }
    try {
      let patients: Patient[];
      if (UUID_PATTERN.test(q.trim())) {
        const patient = await medplum.readResource('Patient', q.trim()) as Patient;
        patients = [patient];
      } else {
        const bundle = await medplum.search('Patient', { name: q, _count: '5' }) as Bundle;
        patients = (bundle.entry ?? []).map((e) => e.resource as Patient).filter(Boolean);
      }
      const newOptions = patients.map((p) => ({ value: p.id!, label: getDisplayString(p) }));
      setOptions(newOptions);
      if (newOptions.length > 0) {
        combobox.openDropdown();
      } else {
        combobox.closeDropdown();
      }
    } catch {
      setOptions([]);
      combobox.closeDropdown();
    }
  }, 300);

  const handleSearchChange = (value: string): void => {
    setSearchValue(value);
    // Only clear selection if the user is typing a new query, not when
    // Autocomplete fires onChange after an option was just selected.
    if (!options.some((o) => o.label === value)) {
      setSelectedPatientId(undefined);
      searchPatients(value);
    }
  };

  const handleOptionSubmit = (value: string): void => {
    setSelectedPatientId(value);
    combobox.closeDropdown();
    const opt = options.find((o) => o.value === value);
    if (opt) {
      setSearchValue(opt.label);
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!selectedPatientId) {
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await createBidirectionalRelationship(medplum, patientId, selectedPatientId, relationshipType);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create relationship');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="xs">
      <Select
        label="Relationship type"
        data={RELATIONSHIP_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        value={relationshipType}
        onChange={(v) => v && setRelationshipType(v)}
      />
      <Autocomplete
        label="Patient"
        placeholder="Search by name or paste UUID"
        value={searchValue}
        onChange={handleSearchChange}
        onOptionSubmit={handleOptionSubmit}
        data={options.map((o) => ({ value: o.value, label: o.label }))}
        comboboxProps={{ store: combobox }}
        filter={({ options }) => options}
      />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Group>
        <Button onClick={handleSave} loading={saving} disabled={!selectedPatientId}>Save</Button>
        <Button variant="subtle" onClick={onCancel}>Cancel</Button>
      </Group>
    </Stack>
  );
}

export function PatientRelationships({ patientId, readonly }: PatientRelationshipsProps): JSX.Element {
  const medplum = useMedplum();
  const [resolved, setResolved] = useState<ResolvedRelationship[]>();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadRelationships = useCallback(() => {
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

  useEffect(() => {
    loadRelationships();
  }, [loadRelationships, refreshKey]);

  const handleSaved = (): void => {
    setShowForm(false);
    setRefreshKey((k) => k + 1);
  };

  if (loading) {
    return <Loader size="sm" />;
  }

  if (readonly && (!resolved || resolved.length === 0)) {
    return <></>;
  }

  return (
    <FormSection title="Relationships">
      <Stack gap="xs" mt={4}>
        {resolved && resolved.length > 0 &&
          resolved.map(({ rp, relationshipDisplay, linkedPatient }) => (
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
        {!readonly && (showForm ? (
          <AddRelationshipForm
            patientId={patientId}
            onSaved={handleSaved}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <Button
            size="sm"
            color="green.6"
            variant="subtle"
            leftSection={<IconCirclePlus size="1.25rem" />}
            onClick={() => setShowForm(true)}
            style={{ alignSelf: 'flex-start' }}
          >
            Add Person
          </Button>
        ))}
      </Stack>
    </FormSection>
  );
}

// ABOUTME: Admin page for deleting FHIR resources associated with a patient.
// ABOUTME: Multi-step flow: select patient, preview resource counts, confirm, delete with progress, results.
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Combobox,
  Group,
  Loader,
  Modal,
  Progress,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  useCombobox,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import type { Bundle, Patient, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import { safeErrorMessage } from '../errors';

/** Maps FHIR resource types to the search parameter that references a Patient. */
const PATIENT_RESOURCE_TYPES: ReadonlyArray<{ readonly type: string; readonly param: string }> = [
  { type: 'Observation', param: 'subject' },
  { type: 'Condition', param: 'subject' },
  { type: 'Encounter', param: 'subject' },
  { type: 'MedicationRequest', param: 'subject' },
  { type: 'DiagnosticReport', param: 'subject' },
  { type: 'Procedure', param: 'subject' },
  { type: 'CarePlan', param: 'subject' },
  { type: 'CareTeam', param: 'subject' },
  { type: 'DocumentReference', param: 'subject' },
  { type: 'Goal', param: 'subject' },
  { type: 'ServiceRequest', param: 'subject' },
  { type: 'Specimen', param: 'subject' },
  { type: 'AllergyIntolerance', param: 'patient' },
  { type: 'Immunization', param: 'patient' },
  { type: 'Claim', param: 'patient' },
  { type: 'RelatedPerson', param: 'patient' },
  { type: 'Coverage', param: 'beneficiary' },
];

type Step = 'select' | 'preview' | 'progress' | 'results';

interface DeleteResult {
  readonly resourceType: string;
  readonly id: string;
  readonly success: boolean;
  readonly error?: string;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return safeErrorMessage(err);
  }
  return String(err);
}

export function DeletePatientResourcesPage(): JSX.Element {
  const medplum = useMedplum();

  const [step, setStep] = useState<Step>('select');

  // Patient search state
  const [patient, setPatient] = useState<Patient>();
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const combobox = useCombobox();

  // Counts state
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [countError, setCountError] = useState<string>();

  // Selection state
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  // Confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Deletion state
  const [deleteResults, setDeleteResults] = useState<DeleteResult[]>([]);
  const [deleteIndex, setDeleteIndex] = useState(0);
  const [deleteTotal, setDeleteTotal] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const cancelRef = useRef(false);

  const searchPatients = useDebouncedCallback(async (query: string) => {
    if (!query.trim()) {
      setPatientResults([]);
      setSearchingPatients(false);
      return;
    }
    setSearchingPatients(true);
    try {
      const bundle = await medplum.search('Patient', { name: query, _count: '10' });
      const patients: Patient[] = [];
      for (const e of bundle.entry ?? []) {
        if (e.resource) {
          patients.push(e.resource);
        }
      }
      setPatientResults(patients);
    } catch {
      setPatientResults([]);
    } finally {
      setSearchingPatients(false);
    }
  }, 300);

  const handlePatientQueryChange = useCallback(
    (value: string) => {
      setPatientQuery(value);
      searchPatients(value);
      if (patient && value !== getDisplayString(patient)) {
        setPatient(undefined);
      }
      combobox.openDropdown();
    },
    [searchPatients, patient, combobox]
  );

  const loadCounts = useCallback(
    async (selectedPatient: Patient) => {
      setLoadingCounts(true);
      setCountError(undefined);
      try {
        const results = await Promise.allSettled(
          PATIENT_RESOURCE_TYPES.map(async ({ type, param }) => {
            const bundle: Bundle = await medplum.search(type as ResourceType, {
              [param]: `Patient/${selectedPatient.id}`,
              _count: '0',
              _total: 'accurate',
            });
            return { type, count: bundle.total ?? 0 };
          })
        );

        const newCounts: Record<string, number> = {};
        const errors: string[] = [];
        for (let i = 0; i < results.length; i++) {
          const result = results[i]!;
          if (result.status === 'fulfilled') {
            newCounts[result.value.type] = result.value.count;
          } else {
            const typeName = PATIENT_RESOURCE_TYPES[i]!.type;
            newCounts[typeName] = 0;
            errors.push(`${typeName}: ${toErrorMessage(result.reason)}`);
          }
        }
        if (errors.length > 0 && Object.values(newCounts).every((c) => c === 0)) {
          throw new Error(`Failed to load counts: ${errors[0]}`);
        }
        setCounts(newCounts);
        setSelectedTypes(new Set());
        setStep('preview');
      } catch (err: unknown) {
        setCountError(toErrorMessage(err));
      } finally {
        setLoadingCounts(false);
      }
    },
    [medplum]
  );

  const handlePatientSelect = useCallback(
    (patientId: string) => {
      const selectedPatient = patientResults.find((p) => p.id === patientId);
      if (selectedPatient) {
        setPatient(selectedPatient);
        setPatientQuery(getDisplayString(selectedPatient));
        combobox.closeDropdown();
        void loadCounts(selectedPatient);
      }
    },
    [patientResults, combobox, loadCounts]
  );

  const typesWithResources = PATIENT_RESOURCE_TYPES.filter(({ type }) => (counts[type] ?? 0) > 0);
  const allSelectableSelected =
    typesWithResources.length > 0 &&
    typesWithResources.every(({ type }) => selectedTypes.has(type));
  const someSelected =
    typesWithResources.some(({ type }) => selectedTypes.has(type)) && !allSelectableSelected;

  const handleSelectAll = useCallback(() => {
    if (allSelectableSelected) {
      setSelectedTypes(new Set());
    } else {
      setSelectedTypes(new Set(typesWithResources.map(({ type }) => type)));
    }
  }, [allSelectableSelected, typesWithResources]);

  const handleToggleType = useCallback(
    (type: string) => {
      setSelectedTypes((prev) => {
        const next = new Set(prev);
        if (next.has(type)) {
          next.delete(type);
        } else {
          next.add(type);
        }
        return next;
      });
    },
    []
  );

  const totalSelectedCount = Array.from(selectedTypes).reduce(
    (sum, type) => sum + (counts[type] ?? 0),
    0
  );

  const handleStartDelete = useCallback(async () => {
    if (!patient) return;
    setConfirmOpen(false);
    setStep('progress');
    setDeleting(true);
    setDeleteResults([]);
    setDeleteIndex(0);
    cancelRef.current = false;

    const results: DeleteResult[] = [];
    let totalResources = 0;

    // First, gather all resource IDs for selected types
    const idsToDelete: Array<{ type: string; id: string }> = [];
    for (const { type, param } of PATIENT_RESOURCE_TYPES) {
      if (!selectedTypes.has(type)) continue;
      if (cancelRef.current) break;
      try {
        const bundle: Bundle = await medplum.search(type as ResourceType, {
          [param]: `Patient/${patient.id}`,
          _elements: 'id',
          _count: '100',
        });
        for (const entry of bundle.entry ?? []) {
          if (entry.resource?.id) {
            idsToDelete.push({ type, id: entry.resource.id });
          }
        }
      } catch (err: unknown) {
        results.push({
          resourceType: type,
          id: '',
          success: false,
          error: `Failed to fetch IDs: ${toErrorMessage(err)}`,
        });
      }
    }

    totalResources = idsToDelete.length + results.length;
    setDeleteTotal(totalResources);

    // Now delete each resource individually
    let processed = results.length;
    for (const { type, id } of idsToDelete) {
      if (cancelRef.current) break;
      try {
        await medplum.deleteResource(type as ResourceType, id);
        results.push({ resourceType: type, id, success: true });
      } catch (err: unknown) {
        results.push({
          resourceType: type,
          id,
          success: false,
          error: toErrorMessage(err),
        });
      }
      processed++;
      setDeleteIndex(processed);
      setDeleteResults([...results]);
    }

    setDeleting(false);
    setStep('results');
  }, [patient, selectedTypes, medplum]);

  const successCount = deleteResults.filter((r) => r.success).length;
  const failureCount = deleteResults.filter((r) => !r.success).length;

  const handleStartOver = useCallback(() => {
    setStep('select');
    setPatient(undefined);
    setPatientQuery('');
    setPatientResults([]);
    setCounts({});
    setSelectedTypes(new Set());
    setDeleteResults([]);
    setDeleteIndex(0);
    setDeleteTotal(0);
    setCountError(undefined);
  }, []);

  return (
    <Stack>
      <Group>
        <IconTrash size={24} />
        <Title order={3}>Delete Patient Resources</Title>
      </Group>

      {step === 'select' && (
        <Card withBorder>
          <Stack>
            <Text>
              Search for a patient to view and delete their associated FHIR
              resources. This will count all resources linked to the patient
              across supported resource types.
            </Text>
            <Combobox
              store={combobox}
              onOptionSubmit={handlePatientSelect}
            >
              <Combobox.Target>
                <TextInput
                  label="Patient"
                  placeholder="Search by name..."
                  value={patientQuery}
                  onChange={(e) =>
                    handlePatientQueryChange(e.currentTarget.value)
                  }
                  onFocus={() => combobox.openDropdown()}
                  onBlur={() => combobox.closeDropdown()}
                  rightSection={
                    searchingPatients || loadingCounts ? (
                      <Loader size={16} />
                    ) : null
                  }
                />
              </Combobox.Target>
              <Combobox.Dropdown>
                <Combobox.Options>
                  {patientResults.length > 0 ? (
                    patientResults.map((p) => (
                      <Combobox.Option key={p.id} value={p.id ?? ''}>
                        <Text size="sm">{getDisplayString(p)}</Text>
                        <Text size="xs" c="dimmed">
                          Patient/{p.id}
                        </Text>
                      </Combobox.Option>
                    ))
                  ) : patientQuery.trim() ? (
                    <Combobox.Empty>No patients found</Combobox.Empty>
                  ) : null}
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>
            {loadingCounts && (
              <Group>
                <Loader size={16} />
                <Text size="sm">Loading resource counts...</Text>
              </Group>
            )}
            {countError && <Alert color="red">{countError}</Alert>}
          </Stack>
        </Card>
      )}

      {step === 'preview' && patient && (
        <Card withBorder>
          <Stack>
            <Group>
              <Text size="sm">Patient:</Text>
              <Badge>{getDisplayString(patient)} (Patient/{patient.id})</Badge>
            </Group>

            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    <Checkbox
                      checked={allSelectableSelected}
                      indeterminate={someSelected}
                      onChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </Table.Th>
                  <Table.Th>Resource Type</Table.Th>
                  <Table.Th>Count</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {PATIENT_RESOURCE_TYPES.map(({ type }) => {
                  const count = counts[type] ?? 0;
                  const dimmed = count === 0;
                  return (
                    <Table.Tr
                      key={type}
                      style={dimmed ? { opacity: 0.4 } : undefined}
                    >
                      <Table.Td>
                        <Checkbox
                          checked={selectedTypes.has(type)}
                          onChange={() => handleToggleType(type)}
                          disabled={dimmed}
                          aria-label={`Select ${type}`}
                        />
                      </Table.Td>
                      <Table.Td>{type}</Table.Td>
                      <Table.Td>{count}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            <Group>
              <Button
                variant="default"
                onClick={() => {
                  setStep('select');
                  setPatient(undefined);
                  setPatientQuery('');
                  setCounts({});
                  setSelectedTypes(new Set());
                }}
              >
                Back
              </Button>
              <Button
                color="red"
                disabled={selectedTypes.size === 0}
                onClick={() => setConfirmOpen(true)}
              >
                Delete Selected
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Deletion"
      >
        <Stack>
          <Text>
            You are about to delete {totalSelectedCount} resource(s) across{' '}
            {selectedTypes.size} type(s).
          </Text>
          <Text c="red" fw={500}>
            This action cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleStartDelete}>
              Confirm Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {step === 'progress' && (
        <Card withBorder>
          <Stack>
            <Title order={4}>Deleting Resources</Title>
            <Progress
              value={deleteTotal > 0 ? (deleteIndex / deleteTotal) * 100 : 0}
              animated={deleting}
            />
            <Text size="sm">
              {deleteIndex} / {deleteTotal} resources processed
            </Text>
            {deleting && (
              <Button
                variant="default"
                onClick={() => {
                  cancelRef.current = true;
                }}
              >
                Cancel
              </Button>
            )}
          </Stack>
        </Card>
      )}

      {step === 'results' && (
        <Card withBorder>
          <Stack>
            <Title order={4}>Results</Title>
            <Group>
              <Badge color="green" size="lg">
                {successCount} deleted
              </Badge>
              {failureCount > 0 && (
                <Badge color="red" size="lg">
                  {failureCount} failed
                </Badge>
              )}
            </Group>

            {failureCount > 0 && (
              <Stack gap="xs">
                <Text fw={500}>Failures:</Text>
                {deleteResults
                  .filter((r) => !r.success)
                  .map((r, i) => (
                    <Alert key={i} color="red" variant="light">
                      {r.resourceType}/{r.id}: {r.error}
                    </Alert>
                  ))}
              </Stack>
            )}

            <Button variant="default" onClick={handleStartOver}>
              Start Over
            </Button>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

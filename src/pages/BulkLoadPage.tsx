// ABOUTME: Bulk load page for uploading FHIR bundles from ZIP or JSON files into a store.
// ABOUTME: Multi-step flow: file upload, preview with patient picker, upload progress, results.
import {
  Alert,
  Badge,
  Button,
  Card,
  Combobox,
  FileInput,
  Group,
  Loader,
  Progress,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  useCombobox,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import type { Bundle, Patient, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconUpload } from '@tabler/icons-react';
import JSZip from 'jszip';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { safeErrorMessage } from '../errors';
import {
  extractPatientIds,
  rewritePatientReferences,
} from '../fhir/rewritePatientReferences';

type Step = 'upload' | 'preview' | 'progress' | 'results';

interface ParsedData {
  readonly resources: Resource[];
  readonly fullUrls: Map<Resource, string>;
  readonly sourcePatientIds: string[];
  readonly counts: Record<string, number>;
}

interface UploadResult {
  readonly resourceType: string;
  readonly success: boolean;
  readonly error?: string;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return safeErrorMessage(err);
  }
  return String(err);
}

export function BulkLoadPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string>();
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedData>();

  // Patient picker state
  const [replacePatient, setReplacePatient] = useState(true);
  const [targetPatient, setTargetPatient] = useState<Patient>();
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const combobox = useCombobox();

  // Upload progress state
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadIndex, setUploadIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const cancelRef = useRef(false);

  const handleFileChange = useCallback((f: File | null) => {
    setFile(f);
    setParseError(undefined);
    setParsed(undefined);
  }, []);

  const handleParse = useCallback(async () => {
    if (!file) return;
    setParsing(true);
    setParseError(undefined);
    try {
      const data = await parseFile(file);
      setParsed(data);
      setStep('preview');
    } catch (err: unknown) {
      setParseError(toErrorMessage(err));
    } finally {
      setParsing(false);
    }
  }, [file]);

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
      if (targetPatient && value !== getDisplayString(targetPatient)) {
        setTargetPatient(undefined);
      }
      combobox.openDropdown();
    },
    [searchPatients, targetPatient, combobox]
  );

  const handleStartUpload = useCallback(async () => {
    if (!parsed) return;
    setStep('progress');
    setUploading(true);
    setUploadResults([]);
    setUploadIndex(0);
    cancelRef.current = false;

    const nonPatientResources = parsed.resources.filter(
      (r) => r.resourceType !== 'Patient'
    );

    // Track urn:uuid -> server-assigned reference so we can rewrite cross-references
    const urnMap = new Map<string, string>();

    const results: UploadResult[] = [];
    for (let i = 0; i < nonPatientResources.length; i++) {
      if (cancelRef.current) break;
      setUploadIndex(i + 1);

      const original = nonPatientResources[i]!;
      const fullUrl = parsed.fullUrls.get(original);

      // Strip id and meta so the server assigns new ones
      const cleaned = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
      delete cleaned.id;
      delete cleaned.meta;

      // Rewrite patient references if enabled
      let toCreate = cleaned as unknown as Resource;
      if (replacePatient && targetPatient?.id) {
        toCreate = rewritePatientReferences(
          toCreate,
          parsed.sourcePatientIds,
          targetPatient.id
        );
      }

      // Rewrite urn:uuid references to server-assigned IDs
      toCreate = rewriteUrnReferences(toCreate, urnMap);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await medplum.createResource(toCreate as any);
        results.push({ resourceType: original.resourceType, success: true });
        // Record the mapping from urn:uuid to the new server-assigned reference
        if (fullUrl && created.id) {
          urnMap.set(fullUrl, `${created.resourceType}/${created.id}`);
        }
      } catch (err: unknown) {
        results.push({
          resourceType: original.resourceType,
          success: false,
          error: toErrorMessage(err),
        });
      }
      setUploadResults([...results]);
    }

    setUploading(false);
    setStep('results');
  }, [parsed, replacePatient, targetPatient, medplum]);

  const successCount = uploadResults.filter((r) => r.success).length;
  const failureCount = uploadResults.filter((r) => !r.success).length;

  return (
    <Stack>
      <Group>
        <IconUpload size={24} />
        <Title order={3}>Bulk Load</Title>
      </Group>

      {step === 'upload' && (
        <Card withBorder>
          <Stack>
            <Text>
              Upload a FHIR Bundle JSON file or a ZIP file containing FHIR
              Bundle JSON files (e.g., from Kindling). Each bundle&apos;s
              resources will be extracted and loaded into the current FHIR store.
            </Text>
            <FileInput
              label="FHIR file"
              placeholder="Select a .json or .zip file"
              accept=".json,.zip"
              value={file}
              onChange={handleFileChange}
            />
            {parseError && <Alert color="red">{parseError}</Alert>}
            <Button
              onClick={handleParse}
              disabled={!file}
              loading={parsing}
            >
              Parse File
            </Button>
          </Stack>
        </Card>
      )}

      {step === 'preview' && parsed && (
        <Card withBorder>
          <Stack>
            <Title order={4}>Contents</Title>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Resource Type</Table.Th>
                  <Table.Th>Count</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.entries(parsed.counts)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([type, count]) => (
                    <Table.Tr key={type}>
                      <Table.Td>{type}</Table.Td>
                      <Table.Td>{count}</Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>

            <Switch
              label="Replace patient references"
              checked={replacePatient}
              onChange={(e) => setReplacePatient(e.currentTarget.checked)}
            />

            {replacePatient && (
              <Combobox
                store={combobox}
                onOptionSubmit={(val) => {
                  const patient = patientResults.find((p) => p.id === val);
                  if (patient) {
                    setTargetPatient(patient);
                    setPatientQuery(getDisplayString(patient));
                  }
                  combobox.closeDropdown();
                }}
              >
                <Combobox.Target>
                  <TextInput
                    label="Target Patient"
                    placeholder="Search by name..."
                    value={patientQuery}
                    onChange={(e) =>
                      handlePatientQueryChange(e.currentTarget.value)
                    }
                    onFocus={() => combobox.openDropdown()}
                    onBlur={() => combobox.closeDropdown()}
                    rightSection={searchingPatients ? <Loader size={16} /> : null}
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
            )}

            {targetPatient && (
              <Group>
                <Text size="sm">Selected:</Text>
                <Badge>{getDisplayString(targetPatient)} (Patient/{targetPatient.id})</Badge>
              </Group>
            )}

            <Group>
              <Button variant="default" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                onClick={handleStartUpload}
                disabled={replacePatient && !targetPatient}
              >
                Start Upload
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      {step === 'progress' && parsed && (
        <Card withBorder>
          <Stack>
            <Title order={4}>Uploading Resources</Title>
            <Progress
              value={
                (uploadIndex /
                  parsed.resources.filter((r) => r.resourceType !== 'Patient')
                    .length) *
                100
              }
              animated={uploading}
            />
            <Text size="sm">
              {uploadIndex} /{' '}
              {parsed.resources.filter((r) => r.resourceType !== 'Patient').length}{' '}
              resources processed
            </Text>
            {uploading && (
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
                {successCount} succeeded
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
                {uploadResults
                  .filter((r) => !r.success)
                  .map((r, i) => (
                    <Alert key={i} color="red" variant="light">
                      {r.resourceType}: {r.error}
                    </Alert>
                  ))}
              </Stack>
            )}

            <Group>
              {targetPatient && (
                <Button
                  onClick={() =>
                    navigate(`/Patient/${targetPatient.id}`)
                  }
                >
                  View Patient
                </Button>
              )}
              <Button
                variant="default"
                onClick={() => {
                  setStep('upload');
                  setFile(null);
                  setParsed(undefined);
                  setUploadResults([]);
                  setUploadIndex(0);
                }}
              >
                Load More
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

async function parseFile(file: File): Promise<ParsedData> {
  if (file.name.endsWith('.zip') || file.type === 'application/zip') {
    return parseZipFile(file);
  }
  return parseJsonFile(file);
}

function collectResources(
  parsed: unknown,
  resources: Resource[],
  fullUrls: Map<Resource, string>
): void {
  if (!parsed || typeof parsed !== 'object' || !('resourceType' in parsed)) {
    return;
  }

  const obj = parsed as { resourceType: string };

  if (obj.resourceType === 'Bundle') {
    const bundle = parsed as Bundle;
    for (const bundleEntry of bundle.entry ?? []) {
      if (bundleEntry.resource) {
        resources.push(bundleEntry.resource);
        if (bundleEntry.fullUrl) {
          fullUrls.set(bundleEntry.resource, bundleEntry.fullUrl);
        }
      }
    }
  } else {
    resources.push(parsed as Resource);
  }
}

function buildParsedData(
  resources: Resource[],
  fullUrls: Map<Resource, string>,
  errorLabel: string
): ParsedData {
  if (resources.length === 0) {
    throw new Error(`No FHIR resources found in the ${errorLabel}`);
  }

  const sourcePatientIds = extractPatientIds(resources, fullUrls);

  const counts: Record<string, number> = {};
  for (const r of resources) {
    counts[r.resourceType] = (counts[r.resourceType] ?? 0) + 1;
  }

  return { resources, fullUrls, sourcePatientIds, counts };
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

async function parseJsonFile(file: File): Promise<ParsedData> {
  const text = await readFileAsText(file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }

  const resources: Resource[] = [];
  const fullUrls = new Map<Resource, string>();
  collectResources(parsed, resources, fullUrls);
  return buildParsedData(resources, fullUrls, 'JSON file');
}

async function parseZipFile(file: File): Promise<ParsedData> {
  const zip = await JSZip.loadAsync(file);
  const resources: Resource[] = [];
  const fullUrls = new Map<Resource, string>();

  const jsonFiles = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.endsWith('.json')
  );

  for (const entry of jsonFiles) {
    const text = await entry.async('text');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue; // Skip non-JSON files
    }

    collectResources(parsed, resources, fullUrls);
  }

  return buildParsedData(resources, fullUrls, 'ZIP file');
}

/** Recursively rewrite urn:uuid: references to server-assigned references. */
function rewriteUrnReferences(
  resource: Resource,
  urnMap: Map<string, string>
): Resource {
  if (urnMap.size === 0) return resource;
  const json = JSON.stringify(resource);
  const rewritten = json.replace(
    /urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    (match) => urnMap.get(match) ?? match
  );
  return JSON.parse(rewritten) as Resource;
}

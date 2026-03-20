// ABOUTME: Extraction tab for Questionnaire resources — template editor and test panel.
// ABOUTME: Lets users configure and test FHIRPath Mapping Language extraction templates.
import { Alert, Button, Code, Group, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { safeErrorMessage } from '../errors';
import {
  EXTRACTION_EXTENSION_URL,
  getExtractionTemplate,
  runExtraction,
} from '../fhir/extraction-helpers';

interface ExtractionTabProps {
  readonly questionnaire: Questionnaire;
  readonly onSave: (updated: Questionnaire) => void;
}

export function ExtractionTab({ questionnaire, onSave }: ExtractionTabProps): JSX.Element {
  const medplum = useMedplum();
  const [templateJson, setTemplateJson] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Test panel state
  const [qrId, setQrId] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState('');
  const [testing, setTesting] = useState(false);

  // Load existing template from questionnaire extension
  useEffect(() => {
    const existing = getExtractionTemplate(questionnaire);
    if (existing) {
      setTemplateJson(JSON.stringify(existing, null, 2));
    }
  }, [questionnaire]);

  const handleSave = useCallback(async () => {
    setSaveError('');
    setSaveSuccess(false);
    setSaving(true);
    try {
      const parsed = JSON.parse(templateJson);
      if (!Array.isArray(parsed)) {
        setSaveError('Template must be a JSON array of resource templates');
        setSaving(false);
        return;
      }

      const extensions = (questionnaire.extension ?? []).filter(
        (e) => e.url !== EXTRACTION_EXTENSION_URL,
      );
      extensions.push({
        url: EXTRACTION_EXTENSION_URL,
        valueString: JSON.stringify(parsed),
      });

      const updated = await medplum.updateResource({
        ...questionnaire,
        extension: extensions,
      });
      onSave(updated as Questionnaire);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof SyntaxError
        ? 'Invalid JSON — please fix syntax errors'
        : safeErrorMessage(err instanceof Error ? err : new Error(String(err))));
    } finally {
      setSaving(false);
    }
  }, [medplum, questionnaire, templateJson, onSave]);

  const handleTest = useCallback(async () => {
    setTestError('');
    setTestResult(null);
    setTesting(true);
    try {
      const parsed = JSON.parse(templateJson);
      if (!Array.isArray(parsed)) {
        setTestError('Template must be a JSON array');
        setTesting(false);
        return;
      }

      const qr = await medplum.readResource('QuestionnaireResponse', qrId.trim());

      const tempQ: Questionnaire = {
        ...questionnaire,
        extension: [
          ...(questionnaire.extension ?? []).filter((e) => e.url !== EXTRACTION_EXTENSION_URL),
          { url: EXTRACTION_EXTENSION_URL, valueString: JSON.stringify(parsed) },
        ],
      };

      const results = runExtraction(tempQ, qr as QuestionnaireResponse);
      setTestResult(JSON.stringify(results, null, 2));
    } catch (err) {
      setTestError(safeErrorMessage(err instanceof Error ? err : new Error(String(err))));
    } finally {
      setTesting(false);
    }
  }, [medplum, questionnaire, templateJson, qrId]);

  return (
    <Stack gap="md">
      <Title order={4}>Extraction Template</Title>
      <Text size="sm" c="dimmed">
        Define a JSON array of resource templates using FHIRPath Mapping Language syntax.
        Each template produces one FHIR resource when a QuestionnaireResponse is submitted.
      </Text>
      <Textarea
        value={templateJson}
        onChange={(e) => {
          setTemplateJson(e.currentTarget.value);
          setSaveSuccess(false);
        }}
        placeholder={'[\n  {\n    "resourceType": "Patient",\n    "name": [{"given": ["{{ QuestionnaireResponse.item.where(linkId=\'name\').answer.value }}"]}]\n  }\n]'}
        rows={16}
        styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
      />
      <Group>
        <Button onClick={handleSave} loading={saving} disabled={!templateJson.trim()}>
          Save Template
        </Button>
        {saveSuccess && <Text size="sm" c="green">Saved</Text>}
      </Group>
      {saveError && <Alert color="red">{saveError}</Alert>}

      <Title order={4} mt="lg">Test Extraction</Title>
      <Text size="sm" c="dimmed">
        Enter a QuestionnaireResponse ID to test the template against.
      </Text>
      <Group>
        <TextInput
          value={qrId}
          onChange={(e) => setQrId(e.currentTarget.value)}
          placeholder="QuestionnaireResponse ID"
          style={{ flex: 1 }}
          styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
        />
        <Button
          onClick={handleTest}
          loading={testing}
          disabled={!qrId.trim() || !templateJson.trim()}
          variant="light"
        >
          Test
        </Button>
      </Group>
      {testError && <Alert color="red">{testError}</Alert>}
      {testResult && (
        <Code block style={{ maxHeight: 400, overflow: 'auto' }}>
          {testResult}
        </Code>
      )}
    </Stack>
  );
}

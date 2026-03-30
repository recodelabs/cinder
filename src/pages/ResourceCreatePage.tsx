// ABOUTME: Page for creating a new FHIR resource.
// ABOUTME: Supports both form-based and JSON-based creation via a mode toggle.
import { ActionIcon, Alert, Box, Button, CopyButton, Group, JsonInput, SegmentedControl, Stack, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { stringify } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { ResourceForm } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { safeErrorMessage } from '../errors';

interface ResourceCreatePageProps {
  readonly resourceType: string;
}

export function ResourceCreatePage({ resourceType }: ResourceCreatePageProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [error, setError] = useState<Error>();
  const [mode, setMode] = useState<string>('form');
  const [jsonValue, setJsonValue] = useState(() => stringify({ resourceType } as Partial<Resource>, true));
  const [parseError, setParseError] = useState<string>();

  const handleSubmit = useCallback(
    (resource: Resource) => {
      setError(undefined);
      medplum
        .createResource(resource)
        .then((created) => navigate(`/${created.resourceType}/${created.id}`))
        .catch(setError);
    },
    [medplum, navigate]
  );

  const handleJsonSubmit = useCallback(() => {
    try {
      setParseError(undefined);
      handleSubmit(JSON.parse(jsonValue));
    } catch {
      setParseError('Invalid JSON. Please fix syntax errors before saving.');
    }
  }, [handleSubmit, jsonValue]);

  return (
    <Stack>
      <SegmentedControl
        data={[
          { label: 'Form', value: 'form' },
          { label: 'JSON', value: 'json' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {error && <Alert color="red">{safeErrorMessage(error)}</Alert>}
      {parseError && <Alert color="red">{parseError}</Alert>}
      {mode === 'form' ? (
        <ResourceForm
          defaultValue={{ resourceType } as Partial<Resource>}
          onSubmit={handleSubmit}
        />
      ) : (
        <Stack>
          <Box pos="relative">
            <JsonInput
              data-testid="create-json-input"
              value={jsonValue}
              onChange={setJsonValue}
              formatOnBlur
              autosize
              minRows={24}
              deserialize={JSON.parse}
            />
            <CopyButton value={jsonValue} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="left">
                  <ActionIcon
                    variant="subtle"
                    color={copied ? 'teal' : 'gray'}
                    onClick={copy}
                    pos="absolute"
                    top={8}
                    right={8}
                    aria-label="Copy JSON"
                  >
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Box>
          <Group justify="flex-end">
            <Button onClick={handleJsonSubmit}>Create</Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

// ABOUTME: Editable JSON view for a FHIR resource.
// ABOUTME: Displays pretty-printed JSON with a save button.
import { Alert, Button, Group, JsonInput, Stack } from '@mantine/core';
import { stringify } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';

interface ResourceJsonTabProps {
  readonly resource: Resource;
  readonly onSubmit: (resource: Resource) => void;
}

export function ResourceJsonTab({ resource, onSubmit }: ResourceJsonTabProps): JSX.Element {
  const [value, setValue] = useState(() => stringify(resource, true));
  const [parseError, setParseError] = useState<string>();

  const handleSubmit = useCallback(() => {
    try {
      setParseError(undefined);
      onSubmit(JSON.parse(value));
    } catch {
      setParseError('Invalid JSON. Please fix syntax errors before saving.');
    }
  }, [onSubmit, value]);

  return (
    <Stack>
      {parseError && <Alert color="red">{parseError}</Alert>}
      <JsonInput
        data-testid="resource-json"
        value={value}
        onChange={setValue}
        formatOnBlur
        autosize
        minRows={24}
        deserialize={JSON.parse}
      />
      <Group justify="flex-end">
        <Button onClick={handleSubmit}>OK</Button>
      </Group>
    </Stack>
  );
}

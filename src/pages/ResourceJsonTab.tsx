// ABOUTME: Editable JSON view for a FHIR resource.
// ABOUTME: Displays pretty-printed JSON with a save button.
import { Button, Group, JsonInput, Stack } from '@mantine/core';
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

  const handleSubmit = useCallback(() => {
    onSubmit(JSON.parse(value));
  }, [onSubmit, value]);

  return (
    <Stack>
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

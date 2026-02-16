// ABOUTME: Editable JSON view for a FHIR resource.
// ABOUTME: Displays pretty-printed JSON with a save button.
import { ActionIcon, Alert, Box, Button, CopyButton, Group, JsonInput, Stack, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
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
      <Box pos="relative">
        <JsonInput
          data-testid="resource-json"
          value={value}
          onChange={setValue}
          formatOnBlur
          autosize
          minRows={24}
          deserialize={JSON.parse}
        />
        <CopyButton value={value} timeout={2000}>
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
        <Button onClick={handleSubmit}>OK</Button>
      </Group>
    </Stack>
  );
}

// ABOUTME: Sign-in landing page for unauthenticated users.
// ABOUTME: Shows app branding and a Google OAuth sign-in button.
import { Button, Center, Group, Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { CinderLogo } from '../CinderLogo';

export function SignInPage(): JSX.Element {
  const { signIn } = useAuth();

  return (
    <Center h="100vh">
      <Stack align="center" gap="lg">
        <Stack align="center" gap={0}>
          <Group gap={6}>
            <CinderLogo size={48} />
            <Title order={1}>Cinder</Title>
          </Group>
          <Text size="lg" c="dimmed">FHIR Browser</Text>
        </Stack>
        <Button size="lg" onClick={signIn}>Sign in with Google</Button>
      </Stack>
    </Center>
  );
}

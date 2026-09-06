// ABOUTME: Sign-in landing page for unauthenticated users.
// ABOUTME: Shows app branding, a Google OAuth button, and (in dev builds) an email/password form.
import { Button, Center, Divider, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { CinderLogo } from '../CinderLogo';

const DEV_AUTH = typeof __CINDER_DEV_AUTH__ !== 'undefined' && __CINDER_DEV_AUTH__;

function DevEmailSignIn(): JSX.Element {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const run = async (action: 'sign-in' | 'sign-up'): Promise<void> => {
    setError(undefined);
    setLoading(true);
    try {
      const failure =
        action === 'sign-in'
          ? await signInWithEmail({ email, password })
          : await signUpWithEmail({ email, password, name: email.split('@')[0] });
      if (failure) setError(failure);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder p="md" w={320}>
      <Stack gap="sm">
        <Text size="sm" fw={500}>Local development sign-in</Text>
        <TextInput
          label="Email"
          placeholder="dev@example.com"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          autoComplete="username"
        />
        <PasswordInput
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          autoComplete="current-password"
        />
        {error && <Text c="red" size="sm">{error}</Text>}
        <Group grow>
          <Button variant="default" onClick={() => run('sign-up')} loading={loading} disabled={!email || !password}>
            Create account
          </Button>
          <Button onClick={() => run('sign-in')} loading={loading} disabled={!email || !password}>
            Sign in
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export function SignInPage(): JSX.Element {
  const { signIn } = useAuth();

  return (
    <Center h="100vh">
      <Stack align="center" gap="sm">
        <Group gap={10} wrap="nowrap">
          <CinderLogo size={48} />
          <Title order={1}>Cinder</Title>
        </Group>
        <Text size="lg" c="dimmed">FHIR Browser</Text>
        <Button size="lg" onClick={signIn}>Sign in with Google</Button>
        {DEV_AUTH && (
          <>
            <Divider w={320} label="or" labelPosition="center" />
            <DevEmailSignIn />
          </>
        )}
      </Stack>
    </Center>
  );
}

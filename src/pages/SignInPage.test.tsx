// ABOUTME: Tests for the sign-in landing page.
// ABOUTME: Verifies rendering, the Google button, and the dev email/password form.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSignIn = vi.fn();
const mockSignInWithEmail = vi.fn(() => Promise.resolve<string | undefined>(undefined));
const mockSignUpWithEmail = vi.fn(() => Promise.resolve<string | undefined>(undefined));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signInWithEmail: mockSignInWithEmail,
    signUpWithEmail: mockSignUpWithEmail,
  }),
}));

/** The dev-auth flag is a build-time global (vite define), so pin it per test and re-import. */
async function renderPage(devAuth: boolean): Promise<void> {
  vi.stubGlobal('__CINDER_DEV_AUTH__', devAuth);
  vi.resetModules();
  const { SignInPage } = await import('./SignInPage');
  render(
    <MantineProvider>
      <SignInPage />
    </MantineProvider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('SignInPage', () => {
  it('renders Cinder title and subtitle', async () => {
    await renderPage(false);
    expect(screen.getByText('Cinder')).toBeDefined();
    expect(screen.getByText('FHIR Browser')).toBeDefined();
  });

  it('renders sign-in button', async () => {
    await renderPage(false);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDefined();
  });

  it('calls signIn when button is clicked', async () => {
    const user = userEvent.setup();
    await renderPage(false);
    await user.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(mockSignIn).toHaveBeenCalled();
  });

  it('hides the dev email form when dev auth is disabled', async () => {
    await renderPage(false);
    expect(screen.queryByLabelText('Email')).toBeNull();
  });
});

describe('SignInPage with dev auth', () => {
  it('signs in or creates an account with email and password', async () => {
    const user = userEvent.setup();
    await renderPage(true);

    await user.type(screen.getByLabelText('Email'), 'dev@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter22');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(mockSignInWithEmail).toHaveBeenCalledWith({ email: 'dev@example.com', password: 'hunter22' });

    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(mockSignUpWithEmail).toHaveBeenCalledWith({ email: 'dev@example.com', password: 'hunter22', name: 'dev' });
  });
});

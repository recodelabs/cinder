// ABOUTME: Tests for the sign-in landing page.
// ABOUTME: Verifies rendering, the Google button, the optional Keycloak button and error message, and the dev email/password form.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSignIn = vi.fn();
const mockSignInWithOAuth2 = vi.fn();
const mockSignInWithEmail = vi.fn(() => Promise.resolve<string | undefined>(undefined));
const mockSignUpWithEmail = vi.fn(() => Promise.resolve<string | undefined>(undefined));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signInWithOAuth2: mockSignInWithOAuth2,
    signInWithEmail: mockSignInWithEmail,
    signUpWithEmail: mockSignUpWithEmail,
  }),
}));

/** Stubs GET /api/sign-in-options; null means the server has no Keycloak sign-in. */
function stubSignInOptions(keycloak: { providerId: string; label: string } | null): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ keycloak }))));
}

/** The dev-auth flag is a build-time global (vite define), so pin it per test and re-import. */
async function renderPage(devAuth: boolean, keycloak: { providerId: string; label: string } | null = null): Promise<void> {
  stubSignInOptions(keycloak);
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
  window.history.replaceState(null, '', '/');
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

describe('SignInPage with Keycloak', () => {
  const ICR = { providerId: 'keycloak', label: 'ICR' };

  it('shows no Keycloak button when the server has none', async () => {
    await renderPage(false, null);
    await screen.findByRole('button', { name: /sign in with google/i });
    expect(screen.queryByRole('button', { name: /sign in with icr/i })).toBeNull();
  });

  it('shows the Keycloak button next to Google and starts its sign-in', async () => {
    const user = userEvent.setup();
    await renderPage(false, ICR);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDefined();
    await user.click(await screen.findByRole('button', { name: /sign in with icr/i }));
    expect(mockSignInWithOAuth2).toHaveBeenCalledWith('keycloak');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('explains an unverified email after a refused sign-in', async () => {
    window.history.replaceState(null, '', '/sign-in?error=user_info_is_missing');
    await renderPage(false, ICR);
    expect(await screen.findByText(/Your ICR account needs a verified email address/)).toBeDefined();
  });

  it('shows other sign-in errors with their code', async () => {
    window.history.replaceState(null, '', '/sign-in?error=access_denied');
    await renderPage(false, null);
    expect(screen.getByText('Sign-in failed (access_denied). Please try again.')).toBeDefined();
  });
});

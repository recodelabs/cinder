// ABOUTME: Tests for the sign-in landing page.
// ABOUTME: Verifies rendering and sign-in button behavior.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignInPage } from './SignInPage';

const mockSignIn = vi.fn();

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));

function renderPage(): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <SignInPage />
    </MantineProvider>
  );
}

describe('SignInPage', () => {
  it('renders Cinder title and subtitle', () => {
    renderPage();
    expect(screen.getByText('Cinder')).toBeDefined();
    expect(screen.getByText('FHIR Browser')).toBeDefined();
  });

  it('renders sign-in button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDefined();
  });

  it('calls signIn when button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(mockSignIn).toHaveBeenCalled();
  });
});

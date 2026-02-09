// ABOUTME: Tests for AuthProvider context.
// ABOUTME: Verifies authentication state is exposed to child components.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { JSX } from 'react';
import { AuthProvider, useAuth } from './AuthProvider';

function TestConsumer(): JSX.Element {
  const { isAuthenticated } = useAuth();
  return <div>{isAuthenticated ? 'signed-in' : 'signed-out'}</div>;
}

describe('AuthProvider', () => {
  it('starts as signed out', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    expect(screen.getByText('signed-out')).toBeDefined();
  });
});

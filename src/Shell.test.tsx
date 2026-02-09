// ABOUTME: Tests for the application shell layout.
// ABOUTME: Verifies navigation, resource type list, search input, header controls, and route rendering.
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from './fhir/medplum-adapter';
import { Shell } from './Shell';

const medplum = new HealthcareMedplumClient({ getAccessToken: () => 'test' });

const mockSignOut = vi.fn();
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: true, signOut: mockSignOut }),
}));

interface RenderShellOptions {
  route?: string;
  onChangeStore?: () => void;
}

function renderShell(options: RenderShellOptions = {}): ReturnType<typeof render> {
  const { route = '/', onChangeStore } = options;
  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[route]}>
          <Shell onChangeStore={onChangeStore} />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('Shell', () => {
  it('renders app title', () => {
    renderShell();
    expect(screen.getByText('Cinder')).toBeDefined();
  });

  it('shows resource type list on home page', () => {
    renderShell({ route: '/' });
    expect(screen.getByText('Patient')).toBeDefined();
    expect(screen.getByText('Observation')).toBeDefined();
  });

  it('renders a search input in the header', () => {
    renderShell();
    expect(screen.getByPlaceholderText('Search...')).toBeDefined();
  });

  it('does not contain patient-only search placeholder', () => {
    const { container } = renderShell();
    expect(container.innerHTML).not.toContain('Search patients...');
  });

  it('renders a sidebar filter input', () => {
    renderShell();
    expect(screen.getByPlaceholderText('Filter...')).toBeDefined();
  });

  it('renders Cinder title as a link to home', () => {
    renderShell({ route: '/Patient' });
    const link = screen.getByRole('link', { name: /Cinder/i });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('renders sign-out button when onChangeStore is provided', () => {
    renderShell({ onChangeStore: vi.fn() });
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined();
  });

  it('calls signOut when sign-out button is clicked', async () => {
    const user = userEvent.setup();
    renderShell({ onChangeStore: vi.fn() });
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('renders change-store button when onChangeStore is provided', () => {
    renderShell({ onChangeStore: vi.fn() });
    expect(screen.getByRole('button', { name: /change store/i })).toBeDefined();
  });

  it('calls onChangeStore when change-store button is clicked', async () => {
    const user = userEvent.setup();
    const onChangeStore = vi.fn();
    renderShell({ onChangeStore });
    await user.click(screen.getByRole('button', { name: /change store/i }));
    expect(onChangeStore).toHaveBeenCalled();
  });

  it('hides auth buttons when onChangeStore is not provided', () => {
    renderShell();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /change store/i })).toBeNull();
  });
});

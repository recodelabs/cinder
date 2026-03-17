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

const medplum = new HealthcareMedplumClient({});

const mockSignOut = vi.fn();
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: true, signOut: mockSignOut }),
}));

vi.mock('./contexts/OrgContext', () => ({
  useOrg: () => ({
    activeOrgId: null,
    activeOrgSlug: null,
    activeProject: null,
    projects: [],
    setActiveOrg: vi.fn(),
    setActiveProject: vi.fn(),
    refreshProjects: vi.fn(),
  }),
}));

vi.mock('./components/OrgSwitcher', () => ({
  OrgSwitcher: () => <div data-testid="org-switcher" />,
}));

vi.mock('./components/ProjectSwitcher', () => ({
  ProjectSwitcher: () => <div data-testid="project-switcher" />,
}));

function renderShell(route = '/'): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[route]}>
          <Shell />
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
    renderShell('/');
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
    renderShell('/Patient');
    const link = screen.getByRole('link', { name: /Cinder/i });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('renders sign-out button', () => {
    renderShell();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined();
  });

  it('calls signOut when sign-out button is clicked', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('renders org and project switchers', () => {
    renderShell();
    expect(screen.getByTestId('org-switcher')).toBeDefined();
    expect(screen.getByTestId('project-switcher')).toBeDefined();
  });
});

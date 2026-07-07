// ABOUTME: Tests for the Projects card grid, focusing on the edit/delete menu and delete confirmation.
// ABOUTME: Mocks OrgContext and router navigation to isolate the page's behavior.
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from './ProjectsPage';

const mockNavigate = vi.fn();
const mockDeleteProject = vi.fn(() => Promise.resolve());
const mockSetActiveProject = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const project = {
  id: 'proj-1',
  name: 'Alpha',
  slug: 'alpha',
  description: 'First project',
  organizationId: 'org-1',
  gcpProject: 'gcp-alpha',
  gcpLocation: 'us-central1',
  gcpDataset: 'ds',
  gcpFhirStore: 'store',
};

vi.mock('../contexts/OrgContext', () => ({
  useOrg: () => ({
    activeOrgSlug: 'my-org',
    projects: [project],
    setActiveProject: mockSetActiveProject,
    deleteProject: mockDeleteProject,
  }),
}));

function renderPage(): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the project card', () => {
    renderPage();
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('gcp-alpha/store')).toBeDefined();
  });

  it('navigates to the edit page from the menu', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Actions for Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    expect(mockNavigate).toHaveBeenCalledWith('/orgs/my-org/projects/alpha/edit');
  });

  it('deletes a project after confirming', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Actions for Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Are you sure/)).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockDeleteProject).toHaveBeenCalledWith('proj-1'));
  });

  it('does not delete when cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Actions for Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(mockDeleteProject).not.toHaveBeenCalled();
  });
});

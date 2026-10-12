// ABOUTME: Tests for the create-organization form: the Google Cloud Healthcare API setting is hidden unless turned on.
// ABOUTME: Mocks the Better Auth client, OrgContext, and router navigation.
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrgPage } from './CreateOrgPage';

const mockNavigate = vi.fn();
const mockSetActiveOrg = vi.fn();
const mockCreate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../auth/auth-client', () => ({
  authClient: { organization: { create: (...args: unknown[]) => mockCreate(...args) } },
}));

vi.mock('../contexts/OrgContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts/OrgContext')>()),
  useOrg: () => ({ setActiveOrg: mockSetActiveOrg }),
}));

function renderPage(): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <CreateOrgPage />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe('CreateOrgPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ data: { id: 'org-1', slug: 'icr-demo' } });
  });

  it('does not ask about Google Cloud authentication by default', () => {
    renderPage();
    expect(screen.queryByText('Service Account')).toBeNull();
    expect(screen.queryByText('My Google Account')).toBeNull();
  });

  it('creates an org for FHIR servers and goes to its projects', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/Name/), 'ICR Demo');
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/orgs/icr-demo/projects'));
    expect(mockCreate).toHaveBeenCalledWith({ name: 'ICR Demo', slug: 'icr-demo', metadata: { authMode: 'service_account' } });
    expect(mockSetActiveOrg).toHaveBeenCalledWith('org-1');
  });

  it('shows the authentication choice when Google Cloud Healthcare API is turned on', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('switch', { name: /Google Cloud Healthcare API/ }));
    expect(screen.getByText('Service Account')).toBeDefined();
    expect(screen.getByText('My Google Account')).toBeDefined();
  });

  it('sends a Google Cloud service-account org to its credentials settings', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/Name/), 'ICR Demo');
    await user.click(screen.getByRole('switch', { name: /Google Cloud Healthcare API/ }));
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/orgs/icr-demo/settings'));
    expect(mockCreate).toHaveBeenCalledWith({ name: 'ICR Demo', slug: 'icr-demo', metadata: { authMode: 'service_account' } });
  });

  it("stores the user's own Google token mode when chosen", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/Name/), 'ICR Demo');
    await user.click(screen.getByRole('switch', { name: /Google Cloud Healthcare API/ }));
    await user.click(screen.getByRole('radio', { name: /My Google Account/ }));
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/orgs/icr-demo/projects'));
    expect(mockCreate).toHaveBeenCalledWith({ name: 'ICR Demo', slug: 'icr-demo', metadata: { authMode: 'user_token' } });
  });
});

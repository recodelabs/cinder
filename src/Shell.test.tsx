// ABOUTME: Tests for the application shell layout.
// ABOUTME: Verifies navigation, resource type list, and route rendering.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Shell } from './Shell';

function renderShell(route = '/'): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[route]}>
        <Shell />
      </MemoryRouter>
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
});

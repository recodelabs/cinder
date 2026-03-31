// ABOUTME: Tests for the BulkDeleteBar toolbar component.
// ABOUTME: Verifies selected count display, button states, and click handlers.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BulkDeleteBar } from './BulkDeleteBar';

function renderBar(props: {
  selectedCount: number;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  return render(
    <MantineProvider>
      <BulkDeleteBar
        selectedCount={props.selectedCount}
        onDelete={props.onDelete ?? vi.fn()}
        onCancel={props.onCancel ?? vi.fn()}
      />
    </MantineProvider>
  );
}

describe('BulkDeleteBar', () => {
  it('shows singular text for 1 selected resource', () => {
    renderBar({ selectedCount: 1 });
    expect(screen.getByText('1 resource selected')).toBeDefined();
  });

  it('shows plural text for multiple selected resources', () => {
    renderBar({ selectedCount: 5 });
    expect(screen.getByText('5 resources selected')).toBeDefined();
  });

  it('disables Delete Selected when count is 0', () => {
    renderBar({ selectedCount: 0 });
    const btn = screen.getByRole('button', { name: /delete selected/i });
    expect(btn).toHaveProperty('disabled', true);
  });

  it('enables Delete Selected when count > 0', () => {
    renderBar({ selectedCount: 3 });
    const btn = screen.getByRole('button', { name: /delete selected/i });
    expect(btn).toHaveProperty('disabled', false);
  });

  it('calls onDelete when Delete Selected is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderBar({ selectedCount: 2, onDelete });
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderBar({ selectedCount: 0, onCancel });
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

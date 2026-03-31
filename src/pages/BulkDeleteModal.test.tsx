// ABOUTME: Tests for the BulkDeleteModal confirmation and progress component.
// ABOUTME: Verifies confirmation prompt, deletion progress, and result display.
import { MantineProvider } from '@mantine/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { BulkDeleteModal } from './BulkDeleteModal';

function renderModal(props: {
  opened?: boolean;
  resourceType?: string;
  resourceIds?: string[];
  onClose?: () => void;
  onComplete?: () => void;
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void;
}) {
  const medplum = new HealthcareMedplumClient({});
  props.medplumOverrides?.(medplum);
  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <BulkDeleteModal
          opened={props.opened ?? true}
          resourceType={props.resourceType ?? 'Patient'}
          resourceIds={props.resourceIds ?? ['1', '2', '3']}
          onClose={props.onClose ?? vi.fn()}
          onComplete={props.onComplete ?? vi.fn()}
        />
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('BulkDeleteModal', () => {
  it('shows confirmation with resource count', () => {
    renderModal({ resourceIds: ['a', 'b'] });
    expect(screen.getByText(/2 Patient resources/)).toBeDefined();
    expect(screen.getByText('This action cannot be undone.')).toBeDefined();
  });

  it('shows singular text for 1 resource', () => {
    renderModal({ resourceIds: ['a'] });
    expect(screen.getByText(/1 Patient resource\b/)).toBeDefined();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('deletes resources and shows results on confirm', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderModal({
      resourceIds: ['r1', 'r2'],
      medplumOverrides: (medplum) => {
        vi.spyOn(medplum, 'deleteResource').mockResolvedValue(undefined as any);
      },
      onComplete,
    });

    await user.click(screen.getByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(screen.getByText('2 deleted')).toBeDefined();
    });
  });

  it('shows failures when deletion errors occur', async () => {
    const user = userEvent.setup();
    renderModal({
      resourceIds: ['ok1', 'fail1'],
      medplumOverrides: (medplum) => {
        vi.spyOn(medplum, 'deleteResource').mockImplementation(
          (_type: ResourceType, id: string) => {
            if (id === 'fail1') return Promise.reject(new Error('Not found'));
            return Promise.resolve(undefined as any);
          }
        );
      },
    });

    await user.click(screen.getByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(screen.getByText('1 deleted')).toBeDefined();
      expect(screen.getByText('1 failed')).toBeDefined();
    });
  });

  it('does not render when closed', () => {
    renderModal({ opened: false });
    expect(screen.queryByText(/This action cannot be undone/)).toBeNull();
  });
});

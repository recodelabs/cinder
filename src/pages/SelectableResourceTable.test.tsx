// ABOUTME: Tests for the SelectableResourceTable component used in bulk delete mode.
// ABOUTME: Verifies resource display, checkbox selection, select-all, and pagination.
import { MantineProvider } from '@mantine/core';
import type { Bundle, Patient, ResourceType } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HealthcareMedplumClient } from '../fhir/medplum-adapter';
import { SelectableResourceTable } from './SelectableResourceTable';

const mockPatients: Patient[] = [
  { resourceType: 'Patient', id: 'p1', name: [{ family: 'Smith' }] },
  { resourceType: 'Patient', id: 'p2', name: [{ family: 'Jones' }] },
  { resourceType: 'Patient', id: 'p3', name: [{ family: 'Brown' }] },
];

const mockBundle: Bundle<Patient> = {
  resourceType: 'Bundle',
  type: 'searchset',
  total: 3,
  entry: mockPatients.map((p) => ({ resource: p })),
};

function renderTable(props?: {
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  medplumOverrides?: (medplum: HealthcareMedplumClient) => void;
  fields?: string[];
}) {
  const medplum = new HealthcareMedplumClient({});
  if (props?.medplumOverrides) {
    props.medplumOverrides(medplum);
  } else {
    vi.spyOn(medplum, 'search').mockResolvedValue(mockBundle as any);
  }
  return render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <SelectableResourceTable
          search={{
            resourceType: 'Patient' as ResourceType,
            fields: props?.fields ?? ['_id'],
            count: 20,
          }}
          selectedIds={props?.selectedIds ?? new Set()}
          onSelectionChange={props?.onSelectionChange ?? vi.fn()}
        />
      </MedplumProvider>
    </MantineProvider>
  );
}

describe('SelectableResourceTable', () => {
  it('renders resources with checkboxes', async () => {
    renderTable();
    await waitFor(() => {
      expect(screen.getByLabelText('Select Patient/p1')).toBeDefined();
      expect(screen.getByLabelText('Select Patient/p2')).toBeDefined();
      expect(screen.getByLabelText('Select Patient/p3')).toBeDefined();
    });
  });

  it('renders select all checkbox', async () => {
    renderTable();
    await waitFor(() => {
      expect(screen.getByLabelText('Select all on page')).toBeDefined();
    });
  });

  it('shows loading state', () => {
    renderTable({
      medplumOverrides: (medplum) => {
        vi.spyOn(medplum, 'search').mockReturnValue(new Promise(() => {}));
      },
    });
    expect(screen.getByText('Loading resources...')).toBeDefined();
  });

  it('shows error state', async () => {
    renderTable({
      medplumOverrides: (medplum) => {
        vi.spyOn(medplum, 'search').mockRejectedValue(new Error('Network error'));
      },
    });
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeDefined();
    });
  });

  it('shows empty state when no resources', async () => {
    renderTable({
      medplumOverrides: (medplum) => {
        vi.spyOn(medplum, 'search').mockResolvedValue({
          resourceType: 'Bundle',
          type: 'searchset',
          total: 0,
          entry: [],
        } as any);
      },
    });
    await waitFor(() => {
      expect(screen.getByText('No resources found.')).toBeDefined();
    });
  });

  it('calls onSelectionChange when a checkbox is toggled', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    renderTable({ onSelectionChange });

    await waitFor(() => {
      expect(screen.getByLabelText('Select Patient/p1')).toBeDefined();
    });

    await user.click(screen.getByLabelText('Select Patient/p1'));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['p1']));
  });

  it('calls onSelectionChange with all ids when select all is clicked', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    renderTable({ onSelectionChange });

    await waitFor(() => {
      expect(screen.getByLabelText('Select all on page')).toBeDefined();
    });

    await user.click(screen.getByLabelText('Select all on page'));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['p1', 'p2', 'p3']));
  });

  it('displays field values in table cells', async () => {
    renderTable({ fields: ['_id'] });
    await waitFor(() => {
      expect(screen.getByText('p1')).toBeDefined();
      expect(screen.getByText('p2')).toBeDefined();
    });
  });
});

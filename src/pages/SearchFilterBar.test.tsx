// ABOUTME: Tests for the SearchFilterBar component.
// ABOUTME: Verifies rendering, URL sync, reference formatting, and clear behavior.
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SearchFilterBar } from './SearchFilterBar';
import { formatReferenceValue, getFiltersForResourceType } from './search-filters';

function renderFilterBar(
  resourceType: string,
  initialEntries: string[] = [`/${resourceType}`]
): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <SearchFilterBar resourceType={resourceType} />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe('search-filters', () => {
  it('returns filters for Observation', () => {
    const filters = getFiltersForResourceType('Observation');
    expect(filters.length).toBe(3);
    expect(filters[0]?.code).toBe('subject');
    expect(filters[0]?.type).toBe('reference');
  });

  it('returns empty array for unknown resource type', () => {
    expect(getFiltersForResourceType('Unknown')).toEqual([]);
  });

  it('returns filters for Patient', () => {
    const filters = getFiltersForResourceType('Patient');
    expect(filters.length).toBe(2);
    expect(filters[0]?.code).toBe('name');
  });
});

describe('formatReferenceValue', () => {
  it('prepends Patient/ to bare ID', () => {
    expect(formatReferenceValue('abc-123')).toBe('Patient/abc-123');
  });

  it('leaves qualified references as-is', () => {
    expect(formatReferenceValue('Patient/abc-123')).toBe('Patient/abc-123');
  });

  it('returns empty string for empty input', () => {
    expect(formatReferenceValue('')).toBe('');
    expect(formatReferenceValue('   ')).toBe('');
  });

  it('trims whitespace', () => {
    expect(formatReferenceValue('  abc-123  ')).toBe('Patient/abc-123');
  });
});

describe('SearchFilterBar', () => {
  it('renders filter inputs for Observation', () => {
    renderFilterBar('Observation');
    expect(screen.getByPlaceholderText('Patient')).toBeDefined();
    expect(screen.getByPlaceholderText('Code')).toBeDefined();
    expect(screen.getByPlaceholderText('Status')).toBeDefined();
  });

  it('renders nothing for unknown resource type', () => {
    const { container } = renderFilterBar('Unknown');
    expect(container.innerHTML).toBe('');
  });

  it('renders filter inputs for Patient', () => {
    renderFilterBar('Patient');
    expect(screen.getByPlaceholderText('Name')).toBeDefined();
    expect(screen.getByPlaceholderText('ID')).toBeDefined();
  });

  it('populates values from URL params', () => {
    renderFilterBar('Observation', ['/Observation?subject=Patient/abc-123&code=1234']);
    expect(screen.getByPlaceholderText('Patient')).toHaveValue('abc-123');
    expect(screen.getByPlaceholderText('Code')).toHaveValue('1234');
  });

  it('renders search button', () => {
    renderFilterBar('Observation');
    expect(screen.getByLabelText('Apply filters')).toBeDefined();
  });

  it('shows clear button when values are present', () => {
    renderFilterBar('Observation', ['/Observation?code=1234']);
    expect(screen.getByLabelText('Clear filters')).toBeDefined();
  });

  it('does not show clear button when no values', () => {
    renderFilterBar('Observation');
    expect(screen.queryByLabelText('Clear filters')).toBeNull();
  });

  it('allows typing in filter inputs', async () => {
    const user = userEvent.setup();
    renderFilterBar('Observation');
    const input = screen.getByPlaceholderText('Patient');
    await user.type(input, 'test-id');
    expect(input).toHaveValue('test-id');
  });
});

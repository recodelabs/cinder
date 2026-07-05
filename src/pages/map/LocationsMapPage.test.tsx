// ABOUTME: Tests for the LocationsMapPage: data loading, feature building, filters, info card.
// ABOUTME: MapView is mocked since jsdom has no WebGL; feature clicks are simulated via the mock.
import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Bundle, Location } from '@medplum/fhirtypes';
import { HealthcareMedplumClient } from '../../fhir/medplum-adapter';
import { BOUNDARY_EXTENSION_URL, ICR_LOCATION_TYPE_SYSTEM } from './location-geo';
import type { MapViewProps } from './MapView';
import { LocationsMapPage } from './LocationsMapPage';

const drawState = vi.hoisted(() => ({
  features: [] as unknown[],
  clear: () => {
    drawState.features = [];
  },
}));

vi.mock('./MapView', () => ({
  MapView: ({ data, onFeatureClick, drawMode, drawApiRef }: MapViewProps) => {
    if (drawApiRef) {
      drawApiRef.current = drawMode
        ? { snapshot: () => drawState.features as never, clear: drawState.clear }
        : null;
    }
    return (
      <div data-testid="map-mock" data-draw-mode={drawMode ?? 'none'}>
        <span data-testid="feature-count">{data.features.length}</span>
        <button
          type="button"
          onClick={() => {
            const properties = data.features[0]?.properties;
            if (properties) onFeatureClick?.(properties as never);
          }}
        >
          simulate-feature-click
        </button>
      </div>
    );
  },
}));

const POLYGON = {
  type: 'Polygon',
  coordinates: [
    [
      [-13.0, 9.0],
      [-12.8, 9.0],
      [-12.8, 9.2],
      [-13.0, 9.2],
      [-13.0, 9.0],
    ],
  ],
};

const district: Location = {
  resourceType: 'Location',
  id: 'district-1',
  name: 'Kambia District',
  type: [{ coding: [{ system: ICR_LOCATION_TYPE_SYSTEM, code: 'admin-unit' }] }],
  extension: [
    {
      url: BOUNDARY_EXTENSION_URL,
      valueAttachment: { contentType: 'application/geo+json', data: btoa(JSON.stringify(POLYGON)) },
    },
  ],
};

const facility: Location = {
  resourceType: 'Location',
  id: 'facility-1',
  name: 'Rokupr CHC',
  type: [{ coding: [{ system: ICR_LOCATION_TYPE_SYSTEM, code: 'facility' }] }],
  position: { longitude: -12.95, latitude: 9.02 },
};

const noGeometry: Location = {
  resourceType: 'Location',
  id: 'bare-1',
  name: 'No Geometry Ward',
};

function bundleOf(...locations: Location[]): Bundle<Location> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: locations.map((resource) => ({ resource })),
  };
}

function renderPage(searchImpl: (...args: unknown[]) => Promise<Bundle<Location>>): HealthcareMedplumClient {
  const medplum = new HealthcareMedplumClient({ projectId: 'test-project' });
  medplum.search = vi.fn(searchImpl) as never;
  render(
    <MantineProvider>
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <LocationsMapPage />
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  );
  return medplum;
}

describe('LocationsMapPage', () => {
  it('loads locations and reports geometry counts', async () => {
    renderPage(async () => bundleOf(district, facility, noGeometry));
    await waitFor(() => {
      expect(screen.getByText('2 of 3 locations have geometry')).toBeInTheDocument();
    });
    expect(screen.getByTestId('feature-count')).toHaveTextContent('2');
  });

  it('shows the info card when a feature is clicked, with resource link and drill-down', async () => {
    const medplum = renderPage(async () => bundleOf(district, facility));
    await waitFor(() => {
      expect(screen.getByTestId('feature-count')).toHaveTextContent('2');
    });

    await userEvent.click(screen.getByText('simulate-feature-click'));
    expect(screen.getByText('Kambia District')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View resource' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show children' }));
    await waitFor(() => {
      const calls = (medplum.search as ReturnType<typeof vi.fn>).mock.calls;
      const hasPartOf = calls.some(([, query]) => {
        return query instanceof URLSearchParams && query.get('partof') === 'Location/district-1';
      });
      expect(hasPartOf).toBe(true);
    });
  });

  it('passes the search parameters for the default (unfiltered) load', async () => {
    const medplum = renderPage(async () => bundleOf(district));
    await waitFor(() => {
      expect(screen.getByTestId('feature-count')).toHaveTextContent('1');
    });
    const [resourceType, query] = (medplum.search as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      URLSearchParams,
    ];
    expect(resourceType).toBe('Location');
    expect(query.get('_count')).toBe('200');
    expect(query.get('type')).toBeNull();
    expect(query.get('partof')).toBeNull();
  });

  it('follows next links and accumulates all pages', async () => {
    const page1: Bundle<Location> = {
      ...bundleOf(district),
      link: [{ relation: 'next', url: 'https://example.org/fhir/Location?_count=200&_page_token=tok123' }],
    };
    let call = 0;
    const medplum = renderPage(async () => {
      call += 1;
      return call === 1 ? page1 : bundleOf(facility);
    });
    await waitFor(() => {
      expect(screen.getByText('2 of 2 locations have geometry')).toBeInTheDocument();
    });
    const secondQuery = (medplum.search as ReturnType<typeof vi.fn>).mock.calls[1]?.[1] as URLSearchParams;
    expect(secondQuery.get('_page_token')).toBe('tok123');
  });

  it('shows an error alert when the search fails', async () => {
    renderPage(async () => {
      throw new Error('boom');
    });
    await waitFor(() => {
      expect(screen.getByText('Failed to load locations')).toBeInTheDocument();
    });
  });

  it('saves a drawn polygon to the boundary extension of the selected location', async () => {
    const medplum = renderPage(async () => bundleOf(district, facility));
    medplum.readResource = vi.fn(async () => district) as never;
    medplum.updateResource = vi.fn(async (resource: Location) => resource) as never;

    await waitFor(() => {
      expect(screen.getByTestId('feature-count')).toHaveTextContent('2');
    });

    await userEvent.click(screen.getByText('simulate-feature-click'));
    await userEvent.click(screen.getByRole('button', { name: 'Edit geometry' }));
    expect(screen.getByTestId('map-mock')).toHaveAttribute('data-draw-mode', 'polygon');

    drawState.features = [{ type: 'Feature', geometry: POLYGON, properties: {} }];
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalledTimes(1);
    });
    expect(medplum.readResource).toHaveBeenCalledWith('Location', 'district-1');
    const saved = (medplum.updateResource as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Location;
    const boundary = saved.extension?.find((e) => e.url === BOUNDARY_EXTENSION_URL);
    expect(boundary?.valueAttachment?.contentType).toBe('application/geo+json');
    expect(JSON.parse(atob(boundary?.valueAttachment?.data ?? ''))).toEqual(POLYGON);
  });

  it('saves a drawn point to Location.position', async () => {
    const medplum = renderPage(async () => bundleOf(facility));
    medplum.readResource = vi.fn(async () => facility) as never;
    medplum.updateResource = vi.fn(async (resource: Location) => resource) as never;

    await waitFor(() => {
      expect(screen.getByTestId('feature-count')).toHaveTextContent('1');
    });

    await userEvent.click(screen.getByText('simulate-feature-click'));
    await userEvent.click(screen.getByRole('button', { name: 'Edit geometry' }));
    expect(screen.getByTestId('map-mock')).toHaveAttribute('data-draw-mode', 'point');

    drawState.features = [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-12.5, 9.5] }, properties: {} },
    ];
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalledTimes(1);
    });
    const saved = (medplum.updateResource as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Location;
    expect(saved.position).toEqual({ longitude: -12.5, latitude: 9.5 });
  });
});

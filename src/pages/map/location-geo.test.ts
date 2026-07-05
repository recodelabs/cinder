// ABOUTME: Tests for the FHIR Location → GeoJSON extraction helpers.
// ABOUTME: Covers the ICR boundary extension, position fallback, and bounds computation.
import type { Location } from '@medplum/fhirtypes';
import type { FeatureCollection, Polygon } from 'geojson';
import { describe, expect, it, vi } from 'vitest';
import {
  BOUNDARY_EXTENSION_URL,
  ICR_LOCATION_TYPE_SYSTEM,
  buildLocationFeatures,
  computeBounds,
  featureCollection,
  geometryToBoundaryAttachment,
  getBoundaryAttachment,
  getLocationTypeCode,
  mapWithConcurrency,
  parseGeoJsonGeometries,
  polygonsToGeometry,
  resolveBoundaryGeometries,
  withBoundaryAttachment,
} from './location-geo';

const POLYGON: Polygon = {
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

function locationWith(partial: Partial<Location>): Location {
  return { resourceType: 'Location', id: 'loc-1', name: 'Kambia District', ...partial };
}

function boundaryLocation(attachment: Record<string, unknown>): Location {
  return locationWith({
    extension: [{ url: BOUNDARY_EXTENSION_URL, valueAttachment: attachment }],
  });
}

describe('getLocationTypeCode', () => {
  it('prefers the ICR location-type system over other codings', () => {
    const location = locationWith({
      type: [
        { coding: [{ system: 'http://example.org/other', code: 'other-code' }] },
        { coding: [{ system: ICR_LOCATION_TYPE_SYSTEM, code: 'admin-unit' }] },
      ],
    });
    expect(getLocationTypeCode(location)).toBe('admin-unit');
  });

  it('falls back to the first coding of any system', () => {
    const location = locationWith({
      type: [{ coding: [{ system: 'http://example.org/other', code: 'clinic' }] }],
    });
    expect(getLocationTypeCode(location)).toBe('clinic');
  });

  it('returns undefined when there is no type', () => {
    expect(getLocationTypeCode(locationWith({}))).toBeUndefined();
  });
});

describe('getBoundaryAttachment', () => {
  it('finds the ICR boundary extension attachment', () => {
    const location = boundaryLocation({ contentType: 'application/geo+json', url: 'https://example.org/b.geojson' });
    expect(getBoundaryAttachment(location)?.url).toBe('https://example.org/b.geojson');
  });

  it('returns undefined without the extension', () => {
    expect(getBoundaryAttachment(locationWith({}))).toBeUndefined();
  });
});

describe('parseGeoJsonGeometries', () => {
  it('accepts a bare geometry', () => {
    expect(parseGeoJsonGeometries(JSON.stringify(POLYGON))).toEqual([POLYGON]);
  });

  it('accepts a Feature', () => {
    const feature = { type: 'Feature', geometry: POLYGON, properties: {} };
    expect(parseGeoJsonGeometries(JSON.stringify(feature))).toEqual([POLYGON]);
  });

  it('accepts a FeatureCollection and flattens all geometries', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: POLYGON, properties: {} },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
      ],
    };
    const result = parseGeoJsonGeometries(JSON.stringify(fc));
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ type: 'Point', coordinates: [1, 2] });
  });

  it('flattens a GeometryCollection', () => {
    const gc = { type: 'GeometryCollection', geometries: [POLYGON, { type: 'Point', coordinates: [0, 0] }] };
    expect(parseGeoJsonGeometries(JSON.stringify(gc))).toHaveLength(2);
  });

  it('returns [] for unrecognized shapes', () => {
    expect(parseGeoJsonGeometries(JSON.stringify({ type: 'Nope' }))).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseGeoJsonGeometries('not json')).toThrow();
  });
});

describe('resolveBoundaryGeometries', () => {
  it('decodes inline base64 data', async () => {
    const location = boundaryLocation({
      contentType: 'application/geo+json',
      data: btoa(JSON.stringify(POLYGON)),
    });
    await expect(resolveBoundaryGeometries(location)).resolves.toEqual([POLYGON]);
  });

  it('fetches the attachment url', async () => {
    const location = boundaryLocation({ contentType: 'application/geo+json', url: 'https://example.org/b.geojson' });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(POLYGON), { status: 200 }));
    await expect(resolveBoundaryGeometries(location, fetchImpl)).resolves.toEqual([POLYGON]);
    expect(fetchImpl).toHaveBeenCalledWith('https://example.org/b.geojson');
  });

  it('resolves to [] on a failed fetch', async () => {
    const location = boundaryLocation({ contentType: 'application/geo+json', url: 'https://example.org/b.geojson' });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
    await expect(resolveBoundaryGeometries(location, fetchImpl)).resolves.toEqual([]);
  });

  it('resolves to [] on a network error', async () => {
    const location = boundaryLocation({ contentType: 'application/geo+json', url: 'https://example.org/b.geojson' });
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(resolveBoundaryGeometries(location, fetchImpl)).resolves.toEqual([]);
  });

  it('resolves to [] on malformed inline data', async () => {
    const location = boundaryLocation({ contentType: 'application/geo+json', data: btoa('not geojson') });
    await expect(resolveBoundaryGeometries(location)).resolves.toEqual([]);
  });

  it('resolves to [] without the extension', async () => {
    await expect(resolveBoundaryGeometries(locationWith({}))).resolves.toEqual([]);
  });
});

describe('buildLocationFeatures', () => {
  it('builds boundary features with type-coded properties', () => {
    const location = locationWith({
      type: [{ coding: [{ system: ICR_LOCATION_TYPE_SYSTEM, code: 'admin-unit' }] }],
    });
    const features = buildLocationFeatures(location, [POLYGON]);
    expect(features).toHaveLength(1);
    expect(features[0]?.geometry).toEqual(POLYGON);
    expect(features[0]?.properties).toMatchObject({ id: 'loc-1', name: 'Kambia District', typeCode: 'admin-unit' });
  });

  it('falls back to a Point from position', () => {
    const location = locationWith({ position: { longitude: -12.9, latitude: 9.1 } });
    const features = buildLocationFeatures(location, []);
    expect(features[0]?.geometry).toEqual({ type: 'Point', coordinates: [-12.9, 9.1] });
  });

  it('returns [] with no geometry at all', () => {
    expect(buildLocationFeatures(locationWith({}), [])).toEqual([]);
  });

  it('prefers the boundary over position when both exist', () => {
    const location = locationWith({ position: { longitude: -12.9, latitude: 9.1 } });
    const features = buildLocationFeatures(location, [POLYGON]);
    expect(features).toHaveLength(1);
    expect(features[0]?.geometry.type).toBe('Polygon');
  });
});

describe('mapWithConcurrency', () => {
  it('preserves order and runs every task', async () => {
    const items = [1, 2, 3, 4, 5];
    const result = await mapWithConcurrency(items, 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('polygonsToGeometry', () => {
  it('returns null for no polygons', () => {
    expect(polygonsToGeometry([])).toBeNull();
  });

  it('returns a single polygon unchanged', () => {
    expect(polygonsToGeometry([POLYGON])).toEqual(POLYGON);
  });

  it('combines several polygons into a MultiPolygon', () => {
    const result = polygonsToGeometry([POLYGON, POLYGON]);
    expect(result?.type).toBe('MultiPolygon');
    expect((result as { coordinates: unknown[] }).coordinates).toHaveLength(2);
  });
});

describe('geometryToBoundaryAttachment / withBoundaryAttachment', () => {
  it('round-trips a geometry through the attachment encoding', async () => {
    const attachment = geometryToBoundaryAttachment(POLYGON, 'Kambia boundary');
    expect(attachment.contentType).toBe('application/geo+json');
    const location = withBoundaryAttachment(locationWith({}), attachment);
    await expect(resolveBoundaryGeometries(location)).resolves.toEqual([POLYGON]);
  });

  it('replaces an existing boundary extension and preserves other extensions', () => {
    const original = locationWith({
      extension: [
        { url: 'http://example.org/other-ext', valueString: 'keep-me' },
        { url: BOUNDARY_EXTENSION_URL, valueAttachment: { contentType: 'application/geo+json', data: btoa('{}') } },
      ],
    });
    const updated = withBoundaryAttachment(original, geometryToBoundaryAttachment(POLYGON, 'new'));
    const boundaries = updated.extension?.filter((e) => e.url === BOUNDARY_EXTENSION_URL);
    expect(boundaries).toHaveLength(1);
    expect(boundaries?.[0]?.valueAttachment?.title).toBe('new');
    expect(updated.extension?.some((e) => e.url === 'http://example.org/other-ext')).toBe(true);
  });
});

describe('computeBounds', () => {
  it('computes bounds across polygons and points', () => {
    const fc: FeatureCollection = featureCollection([
      { type: 'Feature', geometry: POLYGON, properties: {} },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-14.0, 8.5] }, properties: {} },
    ]);
    expect(computeBounds(fc)).toEqual([-14.0, 8.5, -12.8, 9.2]);
  });

  it('returns null for an empty collection', () => {
    expect(computeBounds(featureCollection([]))).toBeNull();
  });
});

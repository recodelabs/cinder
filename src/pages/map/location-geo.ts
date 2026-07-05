// ABOUTME: Pure helpers for extracting GeoJSON geometry from FHIR Location resources.
// ABOUTME: Handles the ICR location-boundary-geojson extension, position fallback, and feature building.
import type { Attachment, Location } from '@medplum/fhirtypes';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';

export const BOUNDARY_EXTENSION_URL =
  'https://icr.healthcampaigns.org/StructureDefinition/location-boundary-geojson';
export const ICR_LOCATION_TYPE_SYSTEM =
  'https://icr.healthcampaigns.org/CodeSystem/icr-location-type-cs';

// Codes from the ICR IG's ICRLocationTypeCS CodeSystem
export const ICR_LOCATION_TYPES: readonly { value: string; label: string }[] = [
  { value: 'admin-unit', label: 'Administrative unit' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'facility', label: 'Health facility' },
  { value: 'school', label: 'School' },
  { value: 'community-distribution-point', label: 'Community distribution point' },
  { value: 'temporary-post', label: 'Temporary post' },
  { value: 'household', label: 'Household dwelling' },
  { value: 'supervisory-area', label: 'Supervisory area' },
  { value: 'operational-area', label: 'Operational area' },
];

export const TYPE_COLORS: Record<string, string> = {
  'admin-unit': '#4c6ef5',
  settlement: '#15aabf',
  facility: '#e8590c',
  school: '#7048e8',
  'community-distribution-point': '#f08c00',
  'temporary-post': '#e64980',
  household: '#2f9e44',
  'supervisory-area': '#f59f00',
  'operational-area': '#0ca678',
};

export const DEFAULT_TYPE_COLOR = '#868e96';

export interface LocationFeatureProperties {
  id: string;
  name: string;
  typeCode: string;
  color: string;
}

export function getLocationTypeCode(location: Location): string | undefined {
  for (const concept of location.type ?? []) {
    for (const coding of concept.coding ?? []) {
      if (coding.system === ICR_LOCATION_TYPE_SYSTEM && coding.code) {
        return coding.code;
      }
    }
  }
  return location.type?.[0]?.coding?.[0]?.code;
}

export function getBoundaryAttachment(location: Location): Attachment | undefined {
  return location.extension?.find((e) => e.url === BOUNDARY_EXTENSION_URL)?.valueAttachment;
}

const GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
]);

/**
 * Parses GeoJSON text into a flat list of geometries. Accepts a bare Geometry,
 * a Feature, a FeatureCollection, or a GeometryCollection (flattened).
 * Throws on invalid JSON; returns [] for unrecognized shapes.
 */
export function parseGeoJsonGeometries(text: string): Geometry[] {
  const parsed = JSON.parse(text) as { type?: string } & Record<string, unknown>;
  return collectGeometries(parsed);
}

function collectGeometries(node: { type?: string } & Record<string, unknown>): Geometry[] {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
    return [];
  }
  if (GEOMETRY_TYPES.has(node.type)) {
    return [node as unknown as Geometry];
  }
  if (node.type === 'Feature') {
    const geometry = node['geometry'] as ({ type?: string } & Record<string, unknown>) | null;
    return geometry ? collectGeometries(geometry) : [];
  }
  if (node.type === 'FeatureCollection') {
    const features = node['features'];
    if (!Array.isArray(features)) return [];
    return features.flatMap((f) => collectGeometries(f as { type?: string } & Record<string, unknown>));
  }
  if (node.type === 'GeometryCollection') {
    const geometries = node['geometries'];
    if (!Array.isArray(geometries)) return [];
    return geometries.flatMap((g) => collectGeometries(g as { type?: string } & Record<string, unknown>));
  }
  return [];
}

function decodeBase64Utf8(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Resolves the boundary geometry for a Location: inline base64 `data` first,
 * then a fetch of the attachment `url`. Any failure (bad JSON, network, non-2xx)
 * resolves to [] so the caller can fall back to `position`.
 */
export async function resolveBoundaryGeometries(
  location: Location,
  fetchImpl: typeof fetch = fetch
): Promise<Geometry[]> {
  const attachment = getBoundaryAttachment(location);
  if (!attachment) return [];
  try {
    if (attachment.data) {
      return parseGeoJsonGeometries(decodeBase64Utf8(attachment.data));
    }
    if (attachment.url) {
      const response = await fetchImpl(attachment.url);
      if (!response.ok) return [];
      return parseGeoJsonGeometries(await response.text());
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Builds map features for one Location: boundary geometries when present,
 * otherwise a Point from `Location.position`. Returns [] when there is no geometry.
 */
export function buildLocationFeatures(location: Location, boundaryGeometries: Geometry[]): Feature[] {
  const typeCode = getLocationTypeCode(location) ?? 'unknown';
  const properties: LocationFeatureProperties = {
    id: location.id ?? '',
    name: location.name ?? 'Unnamed location',
    typeCode,
    color: TYPE_COLORS[typeCode] ?? DEFAULT_TYPE_COLOR,
  };
  if (boundaryGeometries.length > 0) {
    return boundaryGeometries.map((geometry) => ({ type: 'Feature', geometry, properties }));
  }
  const { longitude, latitude } = location.position ?? {};
  if (longitude != null && latitude != null) {
    return [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        properties,
      },
    ];
  }
  return [];
}

export function featureCollection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

/** Combines drawn polygons into one geometry: a single Polygon, or a MultiPolygon for several. */
export function polygonsToGeometry(polygons: readonly Polygon[]): Polygon | MultiPolygon | null {
  if (polygons.length === 0) return null;
  if (polygons.length === 1) return polygons[0] as Polygon;
  return { type: 'MultiPolygon', coordinates: polygons.map((p) => p.coordinates) };
}

/** Builds the ICR boundary attachment carrying a GeoJSON geometry as inline base64 data. */
export function geometryToBoundaryAttachment(geometry: Geometry, title: string): Attachment {
  return {
    contentType: 'application/geo+json',
    title,
    data: encodeBase64Utf8(JSON.stringify(geometry)),
  };
}

/** Returns a copy of the Location with its boundary extension replaced (other extensions preserved). */
export function withBoundaryAttachment(location: Location, attachment: Attachment): Location {
  const others = (location.extension ?? []).filter((e) => e.url !== BOUNDARY_EXTENSION_URL);
  return {
    ...location,
    extension: [...others, { url: BOUNDARY_EXTENSION_URL, valueAttachment: attachment }],
  };
}

/** Runs `task` over `items` with bounded concurrency, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await task(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return results;
}

/** Computes [west, south, east, north] bounds across all feature coordinates, or null if empty. */
export function computeBounds(collection: FeatureCollection): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let found = false;

  function visit(coords: unknown): void {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords as [number, number];
      west = Math.min(west, x);
      south = Math.min(south, y);
      east = Math.max(east, x);
      north = Math.max(north, y);
      found = true;
      return;
    }
    for (const child of coords) visit(child);
  }

  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (geometry.type === 'GeometryCollection') {
      for (const g of geometry.geometries) visit((g as { coordinates?: unknown }).coordinates);
    } else {
      visit(geometry.coordinates);
    }
  }
  return found ? [west, south, east, north] : null;
}

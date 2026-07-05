// ABOUTME: Map page visualizing FHIR Location resources from the ICR IG data model.
// ABOUTME: Filters by ICR type and partOf; draws/edits location geometry (position + boundary extension).
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CloseButton,
  Group,
  Loader,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { Bundle, Location } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconAlertCircle, IconPencil } from '@tabler/icons-react';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { MedplumClient } from '@medplum/core';
import { safeErrorMessage } from '../../errors';
import type { LocationFeatureProperties } from './location-geo';
import {
  DEFAULT_TYPE_COLOR,
  ICR_LOCATION_TYPES,
  TYPE_COLORS,
  buildLocationFeatures,
  featureCollection,
  geometryToBoundaryAttachment,
  mapWithConcurrency,
  polygonsToGeometry,
  resolveBoundaryGeometries,
  withBoundaryAttachment,
} from './location-geo';
import type { DrawApi, DrawMode } from './MapView';
import { MapView } from './MapView';

const PAGE_SIZE = 200;
const MAX_LOCATIONS = 1000;
const BOUNDARY_FETCH_CONCURRENCY = 8;

const AREA_TYPE_CODES = new Set(['admin-unit', 'supervisory-area', 'operational-area', 'settlement']);

interface LocationOption {
  id: string;
  name: string;
}

interface MapData {
  collection: FeatureCollection;
  total: number;
  plotted: number;
  truncated: boolean;
}

const EMPTY_DATA: MapData = {
  collection: featureCollection([]),
  total: 0,
  plotted: 0,
  truncated: false,
};

async function fetchLocations(
  medplum: MedplumClient,
  typeCodes: string[],
  parentId: string | undefined
): Promise<{ locations: Location[]; truncated: boolean }> {
  const params = new URLSearchParams({ _count: String(PAGE_SIZE) });
  if (typeCodes.length > 0) {
    params.set('type', typeCodes.join(','));
  }
  if (parentId) {
    params.set('partof', `Location/${parentId}`);
  }
  const locations: Location[] = [];
  let bundle: Bundle<Location> = await medplum.search('Location', params, { cache: 'no-cache' });
  for (;;) {
    for (const entry of bundle.entry ?? []) {
      if (entry.resource?.resourceType === 'Location') {
        locations.push(entry.resource);
      }
    }
    if (locations.length >= MAX_LOCATIONS) {
      return { locations: locations.slice(0, MAX_LOCATIONS), truncated: true };
    }
    const nextUrl = bundle.link?.find((l) => l.relation === 'next')?.url;
    if (!nextUrl) {
      return { locations, truncated: false };
    }
    let nextParams: URLSearchParams;
    try {
      nextParams = new URL(nextUrl).searchParams;
    } catch {
      return { locations, truncated: false };
    }
    bundle = await medplum.search('Location', nextParams, { cache: 'no-cache' });
  }
}

export function LocationsMapPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [typeCodes, setTypeCodes] = useState<string[]>([]);
  const [parent, setParent] = useState<LocationOption | null>(null);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [data, setData] = useState<MapData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LocationFeatureProperties | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [editTarget, setEditTarget] = useState<LocationOption | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('point');
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const drawApiRef = useRef<DrawApi | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(null);
    (async () => {
      const { locations, truncated } = await fetchLocations(medplum, typeCodes, parent?.id);
      const featureLists = await mapWithConcurrency(locations, BOUNDARY_FETCH_CONCURRENCY, async (location) =>
        buildLocationFeatures(location, await resolveBoundaryGeometries(location))
      );
      if (cancelled) return;
      setData({
        collection: featureCollection(featureLists.flat()),
        total: locations.length,
        plotted: featureLists.filter((features) => features.length > 0).length,
        truncated,
      });
    })()
      .catch((err) => {
        if (!cancelled) {
          setData(EMPTY_DATA);
          setError(safeErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [medplum, typeCodes, parent?.id, refreshKey]);

  const handleLocationSearch = useDebouncedCallback(async (query: string) => {
    if (!query.trim()) return;
    try {
      const bundle: Bundle<Location> = await medplum.search('Location', { name: query, _count: '20' });
      const found = (bundle.entry ?? [])
        .map((e) => e.resource)
        .filter((r): r is Location => r?.resourceType === 'Location' && !!r.id)
        .map((r) => ({ id: r.id as string, name: r.name ?? (r.id as string) }));
      setLocationOptions(found);
    } catch {
      // Ignore lookup failures; the user can retype.
    }
  }, 300);

  const locationSelectData = useMemo(() => {
    const seen = new Map<string, string>();
    if (parent) seen.set(parent.id, parent.name);
    if (editTarget) seen.set(editTarget.id, editTarget.name);
    for (const option of locationOptions) {
      if (!seen.has(option.id)) seen.set(option.id, option.name);
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [parent, editTarget, locationOptions]);

  const legendTypes = useMemo(() => {
    const present = new Set<string>();
    for (const feature of data.collection.features) {
      present.add((feature.properties as LocationFeatureProperties | null)?.typeCode ?? 'unknown');
    }
    return ICR_LOCATION_TYPES.filter((t) => present.has(t.value));
  }, [data.collection]);

  const selectedTypeLabel = selected
    ? (ICR_LOCATION_TYPES.find((t) => t.value === selected.typeCode)?.label ?? selected.typeCode)
    : '';

  const rememberOption = (option: LocationOption): void => {
    setLocationOptions((prev) => (prev.some((o) => o.id === option.id) ? prev : [option, ...prev]));
  };

  const startDrawing = (target: LocationOption | null, mode: DrawMode): void => {
    if (target) rememberOption(target);
    setEditTarget(target);
    setDrawMode(mode);
    setDrawing(true);
    setSelected(null);
  };

  const stopDrawing = (): void => {
    drawApiRef.current?.clear();
    setDrawing(false);
    setEditTarget(null);
  };

  const handleSaveDrawing = async (): Promise<void> => {
    const features = drawApiRef.current?.snapshot() ?? [];
    const points = features.filter((f) => f.geometry.type === 'Point').map((f) => f.geometry as Point);
    const polygons = features.filter((f) => f.geometry.type === 'Polygon').map((f) => f.geometry as Polygon);
    if (!editTarget) {
      notifications.show({ color: 'yellow', message: 'Pick the location to attach the geometry to.' });
      return;
    }
    if (points.length === 0 && polygons.length === 0) {
      notifications.show({ color: 'yellow', message: 'Draw a point or a polygon first.' });
      return;
    }
    setSaving(true);
    try {
      const location = await medplum.readResource('Location', editTarget.id);
      let updated: Location = { ...location };
      const lastPoint = points[points.length - 1];
      if (lastPoint) {
        const [longitude, latitude] = lastPoint.coordinates as [number, number];
        updated = { ...updated, position: { longitude, latitude } };
      }
      const boundaryGeometry = polygonsToGeometry(polygons);
      if (boundaryGeometry) {
        updated = withBoundaryAttachment(
          updated,
          geometryToBoundaryAttachment(boundaryGeometry, `${location.name ?? editTarget.id} boundary`)
        );
      }
      await medplum.updateResource(updated);
      notifications.show({ color: 'green', message: `Saved geometry for ${editTarget.name}.` });
      stopDrawing();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Failed to save geometry',
        message: safeErrorMessage(err instanceof Error ? err : new Error(String(err))),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="xs" style={{ height: 'calc(100vh - 82px)' }}>
      <Group justify="space-between" align="flex-end">
        <Title order={3}>Locations Map</Title>
        <Text size="sm" c="dimmed" aria-live="polite">
          {loading
            ? 'Loading locations…'
            : `${data.plotted} of ${data.total} locations have geometry${data.truncated ? ` (showing first ${MAX_LOCATIONS})` : ''}`}
        </Text>
      </Group>
      <Group align="flex-end" gap="sm">
        <MultiSelect
          label="Location type"
          placeholder={typeCodes.length === 0 ? 'All types' : undefined}
          data={ICR_LOCATION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          value={typeCodes}
          onChange={setTypeCodes}
          clearable
          searchable
          w={340}
        />
        <Select
          label="Within location (partOf)"
          placeholder="Search by name…"
          data={locationSelectData}
          value={parent?.id ?? null}
          onChange={(id) => {
            const option = locationSelectData.find((o) => o.value === id);
            setParent(id && option ? { id, name: option.label } : null);
          }}
          onSearchChange={handleLocationSearch}
          searchable
          clearable
          nothingFoundMessage="No matching locations"
          w={300}
        />
        {!drawing && (
          <Button variant="default" leftSection={<IconPencil size={16} />} onClick={() => startDrawing(null, 'point')}>
            Draw geometry
          </Button>
        )}
      </Group>
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Failed to load locations">
          {error}
        </Alert>
      )}
      <Box style={{ position: 'relative', flex: 1, minHeight: 320, borderRadius: 8, overflow: 'hidden' }}>
        <MapView
          data={data.collection}
          onFeatureClick={drawing ? undefined : setSelected}
          drawMode={drawing ? drawMode : null}
          drawApiRef={drawApiRef}
        />
        {loading && (
          <Box style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
            <Loader size="sm" />
          </Box>
        )}
        {drawing && (
          <Card
            shadow="md"
            padding="sm"
            radius="md"
            withBorder
            style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, width: 280 }}
          >
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Text fw={600} size="sm">
                Draw geometry
              </Text>
              <CloseButton size="sm" aria-label="Cancel drawing" onClick={stopDrawing} />
            </Group>
            <Stack gap="xs">
              <Select
                label="Save to location"
                placeholder="Search by name…"
                size="xs"
                data={locationSelectData}
                value={editTarget?.id ?? null}
                onChange={(id) => {
                  const option = locationSelectData.find((o) => o.value === id);
                  setEditTarget(id && option ? { id, name: option.label } : null);
                }}
                onSearchChange={handleLocationSearch}
                searchable
                clearable
                nothingFoundMessage="No matching locations"
              />
              <SegmentedControl
                size="xs"
                fullWidth
                value={drawMode}
                onChange={(value) => setDrawMode(value as DrawMode)}
                data={[
                  { value: 'point', label: 'Point' },
                  { value: 'polygon', label: 'Polygon' },
                ]}
              />
              <Text size="xs" c="dimmed">
                {drawMode === 'point'
                  ? 'Click the map to place the GPS point (saved to Location.position).'
                  : 'Click to add vertices; click the first vertex to close (saved to the boundary extension).'}
              </Text>
              <Group gap="xs" justify="flex-end">
                <Button size="compact-xs" variant="default" onClick={() => drawApiRef.current?.clear()}>
                  Clear
                </Button>
                <Button size="compact-xs" loading={saving} onClick={handleSaveDrawing}>
                  Save
                </Button>
              </Group>
            </Stack>
          </Card>
        )}
        {selected && !drawing && (
          <Card
            shadow="md"
            padding="sm"
            radius="md"
            withBorder
            style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, width: 280 }}
          >
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Text fw={600} size="sm" truncate>
                {selected.name}
              </Text>
              <CloseButton size="sm" aria-label="Close details" onClick={() => setSelected(null)} />
            </Group>
            <Badge color="gray" variant="light" mb="xs">
              {selectedTypeLabel}
            </Badge>
            <Group gap="xs">
              <Button size="compact-xs" variant="light" onClick={() => navigate(`/Location/${selected.id}`)}>
                View resource
              </Button>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => {
                  const option = { id: selected.id, name: selected.name };
                  rememberOption(option);
                  setParent(option);
                }}
              >
                Show children
              </Button>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() =>
                  startDrawing(
                    { id: selected.id, name: selected.name },
                    AREA_TYPE_CODES.has(selected.typeCode) ? 'polygon' : 'point'
                  )
                }
              >
                Edit geometry
              </Button>
            </Group>
          </Card>
        )}
        {legendTypes.length > 0 && (
          <Group
            gap="xs"
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              zIndex: 5,
              background: 'var(--mantine-color-body)',
              borderRadius: 6,
              padding: '4px 8px',
              opacity: 0.92,
            }}
          >
            {legendTypes.map((t) => (
              <Group key={t.value} gap={4} wrap="nowrap">
                <Box
                  w={10}
                  h={10}
                  style={{ borderRadius: '50%', background: TYPE_COLORS[t.value] ?? DEFAULT_TYPE_COLOR }}
                />
                <Text size="xs">{t.label}</Text>
              </Group>
            ))}
          </Group>
        )}
      </Box>
    </Stack>
  );
}

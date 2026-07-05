// ABOUTME: MapLibre GL map that renders location features (boundary polygons + points).
// ABOUTME: Syncs a GeoJSON source with props, fits bounds on data change, reports feature clicks.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TerraDraw, TerraDrawPointMode, TerraDrawPolygonMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Feature, FeatureCollection } from 'geojson';
import type { JSX, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { LocationFeatureProperties } from './location-geo';
import { computeBounds } from './location-geo';

const SOURCE_ID = 'locations';
const CLICKABLE_LAYERS = ['locations-fill', 'locations-point'];

const OSM_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export type DrawMode = 'point' | 'polygon';

/** Imperative handle for reading/clearing drawn features, set while a draw mode is active. */
export interface DrawApi {
  snapshot: () => Feature[];
  clear: () => void;
}

export interface MapViewProps {
  readonly data: FeatureCollection;
  readonly onFeatureClick?: (properties: LocationFeatureProperties) => void;
  readonly drawMode?: DrawMode | null;
  readonly drawApiRef?: RefObject<DrawApi | null>;
}

export function MapView({ data, onFeatureClick, drawMode, drawApiRef }: MapViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const onFeatureClickRef = useRef(onFeatureClick);
  const [styleReady, setStyleReady] = useState(false);

  onFeatureClickRef.current = onFeatureClick;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: [0, 10],
      zoom: 2,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'locations-fill',
        type: 'fill',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 },
      });
      map.addLayer({
        id: 'locations-outline',
        type: 'line',
        source: SOURCE_ID,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      });
      map.addLayer({
        id: 'locations-point',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });
      for (const layerId of CLICKABLE_LAYERS) {
        map.on('click', layerId, (event) => {
          const feature = event.features?.[0];
          if (feature) {
            onFeatureClickRef.current?.(feature.properties as unknown as LocationFeatureProperties);
          }
        });
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }
      setStyleReady(true);
    });

    return () => {
      if (drawRef.current) {
        drawRef.current.stop();
        drawRef.current = null;
      }
      mapRef.current = null;
      setStyleReady(false);
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (drawMode) {
      if (!drawRef.current) {
        const draw = new TerraDraw({
          adapter: new TerraDrawMapLibreGLAdapter({ map }),
          modes: [new TerraDrawPointMode(), new TerraDrawPolygonMode()],
        });
        draw.start();
        drawRef.current = draw;
        if (drawApiRef) {
          drawApiRef.current = {
            snapshot: () => draw.getSnapshot() as Feature[],
            clear: () => draw.clear(),
          };
        }
      }
      drawRef.current.setMode(drawMode);
    } else if (drawRef.current) {
      drawRef.current.stop();
      drawRef.current = null;
      if (drawApiRef) {
        drawApiRef.current = null;
      }
    }
  }, [drawMode, styleReady, drawApiRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const source = map.getSource<maplibregl.GeoJSONSource>(SOURCE_ID);
    source?.setData(data);
    const bounds = computeBounds(data);
    if (bounds) {
      map.fitBounds([bounds[0], bounds[1], bounds[2], bounds[3]], {
        padding: 48,
        maxZoom: 14,
        duration: 600,
      });
    }
  }, [data, styleReady]);

  return <div ref={containerRef} data-testid="locations-map" style={{ width: '100%', height: '100%' }} />;
}

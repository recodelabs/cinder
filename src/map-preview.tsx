// ABOUTME: Dev-only harness for the Locations Map page — no auth, no FHIR store required.
// ABOUTME: Serves fixture ICR Locations from an in-memory stub client at /map-preview.html.
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MedplumClient } from '@medplum/core';
import type { Bundle, Location } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react-hooks';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { BOUNDARY_EXTENSION_URL, ICR_LOCATION_TYPE_SYSTEM } from './pages/map/location-geo';
import { LocationsMapPage } from './pages/map/LocationsMapPage';

function boundary(geometry: object): Location['extension'] {
  return [
    {
      url: BOUNDARY_EXTENSION_URL,
      valueAttachment: { contentType: 'application/geo+json', data: btoa(JSON.stringify(geometry)) },
    },
  ];
}

function icrType(code: string): Location['type'] {
  return [{ coding: [{ system: ICR_LOCATION_TYPE_SYSTEM, code }] }];
}

// Rough boxes around Kambia District, Sierra Leone.
const FIXTURES: Location[] = [
  {
    resourceType: 'Location',
    id: 'district-kambia',
    name: 'Kambia District',
    type: icrType('admin-unit'),
    extension: boundary({
      type: 'Polygon',
      coordinates: [
        [
          [-13.05, 8.95],
          [-12.65, 8.95],
          [-12.6, 9.25],
          [-12.85, 9.35],
          [-13.1, 9.2],
          [-13.05, 8.95],
        ],
      ],
    }),
  },
  {
    resourceType: 'Location',
    id: 'chiefdom-magbema',
    name: 'Magbema Chiefdom',
    type: icrType('admin-unit'),
    partOf: { reference: 'Location/district-kambia' },
    extension: boundary({
      type: 'Polygon',
      coordinates: [
        [
          [-12.98, 9.05],
          [-12.85, 9.05],
          [-12.85, 9.18],
          [-12.98, 9.18],
          [-12.98, 9.05],
        ],
      ],
    }),
  },
  {
    resourceType: 'Location',
    id: 'facility-rokupr',
    name: 'Rokupr CHC',
    type: icrType('facility'),
    partOf: { reference: 'Location/chiefdom-magbema' },
    position: { longitude: -12.95, latitude: 9.02 },
  },
  {
    resourceType: 'Location',
    id: 'facility-kambia-gh',
    name: 'Kambia Government Hospital',
    type: icrType('facility'),
    partOf: { reference: 'Location/district-kambia' },
    position: { longitude: -12.918, latitude: 9.125 },
  },
  {
    resourceType: 'Location',
    id: 'settlement-rokupr',
    name: 'Rokupr',
    type: icrType('settlement'),
    partOf: { reference: 'Location/chiefdom-magbema' },
    position: { longitude: -12.947, latitude: 9.018 },
  },
  {
    resourceType: 'Location',
    id: 'ward-no-geometry',
    name: 'Gbinleh Dixon (no geometry)',
    type: icrType('admin-unit'),
    partOf: { reference: 'Location/district-kambia' },
  },
];

const store = new Map<string, Location>(FIXTURES.map((l) => [l.id as string, l]));

class StubClient extends MedplumClient {
  constructor() {
    super({
      baseUrl: 'http://stub.local',
      fetch: async () => new Response('{}', { status: 200 }),
    });
  }

  override search(_resourceType: never, query?: unknown): never {
    const params = new URLSearchParams(query as URLSearchParams | string);
    const partOf = params.get('partof');
    const types = params.get('type')?.split(',');
    const name = params.get('name')?.toLowerCase();
    let results = Array.from(store.values());
    if (partOf) results = results.filter((l) => l.partOf?.reference === partOf);
    if (types) {
      results = results.filter((l) => l.type?.some((t) => t.coding?.some((c) => types.includes(c.code ?? ''))));
    }
    if (name) results = results.filter((l) => l.name?.toLowerCase().includes(name));
    const bundle: Bundle<Location> = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: results.map((resource) => ({ resource })),
    };
    return Promise.resolve(bundle) as never;
  }

  override readResource(_resourceType: never, id: string): never {
    const found = store.get(id);
    return (found ? Promise.resolve(found) : Promise.reject(new Error('Not found'))) as never;
  }

  override updateResource(resource: never): never {
    const location = resource as Location;
    store.set(location.id as string, location);
    console.log('updateResource', JSON.stringify(location, null, 2));
    return Promise.resolve(location) as never;
  }
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <MantineProvider>
      <Notifications position="top-right" />
      <MedplumProvider medplum={new StubClient()}>
        <MemoryRouter>
          <div style={{ padding: 16, height: '100vh', boxSizing: 'border-box' }}>
            <LocationsMapPage />
          </div>
        </MemoryRouter>
      </MedplumProvider>
    </MantineProvider>
  </StrictMode>
);

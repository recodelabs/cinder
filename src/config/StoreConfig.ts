// ABOUTME: Type definition and localStorage persistence for FHIR store config.
// ABOUTME: Stores GCP project/location/dataset/store coordinates.

export interface StoreConfig {
  project: string;
  location: string;
  dataset: string;
  fhirStore: string;
}

const STORAGE_KEY = 'cinder:store-config';

export function loadStoreConfig(): StoreConfig | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoreConfig) : undefined;
  } catch {
    return undefined;
  }
}

export function saveStoreConfig(config: StoreConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

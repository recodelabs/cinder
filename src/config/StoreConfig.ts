// ABOUTME: Type definition, localStorage persistence, and URL generation for FHIR store config.
// ABOUTME: Stores GCP project/location/dataset/store coordinates.

export interface StoreConfig {
  type: 'gcp';
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

export function clearStoreConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function storeBaseUrl(config: StoreConfig): string {
  return `https://healthcare.googleapis.com/v1/projects/${config.project}/locations/${config.location}/datasets/${config.dataset}/fhirStores/${config.fhirStore}`;
}

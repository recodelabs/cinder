// ABOUTME: MedplumClient subclass that routes FHIR operations through the proxy.
// ABOUTME: Overrides schema and ValueSet methods for local-first operation.
import { MedplumClient, ReadablePromise } from '@medplum/core';
import type { ValueSetExpandParams } from '@medplum/core';
import type { ValueSet } from '@medplum/fhirtypes';
import { expandValueSet } from './valuesets';

export interface HealthcareMedplumClientConfig {
  getAccessToken: () => string | undefined;
  storeBaseUrl?: string;
}

export class HealthcareMedplumClient extends MedplumClient {
  constructor(config: HealthcareMedplumClientConfig) {
    const getAccessToken = config.getAccessToken;
    const storeBaseUrl = config.storeBaseUrl;

    super({
      baseUrl: globalThis.location?.origin ?? 'http://localhost:5173',
      fhirUrlPath: 'fhir',
      fetch: (url: string | URL, init?: RequestInit) => {
        const token = getAccessToken();
        const headers = new Headers(init?.headers);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        if (storeBaseUrl) {
          headers.set('X-Store-Base', storeBaseUrl);
        }
        return fetch(url, { ...init, headers });
      },
    });
  }

  override async requestSchema(): Promise<void> {
    // Schemas are pre-loaded from @medplum/definitions at startup
    return;
  }

  override async requestProfileSchema(): Promise<void> {
    // Profiles are pre-loaded from @medplum/definitions at startup
    return;
  }

  override valueSetExpand(params: ValueSetExpandParams): ReadablePromise<ValueSet> {
    const result = expandValueSet(params.url ?? '', params.filter);
    if (result) {
      return new ReadablePromise(Promise.resolve(result));
    }
    // Fall back to server-side expansion via proxy
    return super.valueSetExpand(params);
  }
}

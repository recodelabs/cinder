// ABOUTME: MedplumClient subclass that routes FHIR operations through the proxy.
// ABOUTME: Overrides schema and ValueSet methods for local-first operation.
import { MedplumClient, ReadablePromise } from '@medplum/core';
import type { ValueSetExpandParams } from '@medplum/core';
import type { ValueSet } from '@medplum/fhirtypes';
import { loadSchemas } from '../schemas';
import { expandValueSet } from './valuesets';

export interface HealthcareMedplumClientConfig {
  getAccessToken: () => string | undefined;
  storeBaseUrl?: string;
  onUnauthenticated?: () => void;
}

export class HealthcareMedplumClient extends MedplumClient {
  constructor(config: HealthcareMedplumClientConfig) {
    const getAccessToken = config.getAccessToken;
    const storeBaseUrl = config.storeBaseUrl;
    const onUnauthenticated = config.onUnauthenticated;

    super({
      baseUrl: globalThis.location?.origin ?? 'http://localhost:5173',
      fhirUrlPath: 'fhir',
      fetch: async (url: string | URL, init?: RequestInit) => {
        const token = getAccessToken();
        const headers = new Headers(init?.headers);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        if (storeBaseUrl) {
          headers.set('X-Store-Base', storeBaseUrl);
        }
        const response = await fetch(url, { ...init, headers });
        if (response.status === 401 && onUnauthenticated) {
          onUnauthenticated();
        }
        return response;
      },
    });
  }

  override async requestSchema(): Promise<void> {
    await loadSchemas();
  }

  override async requestProfileSchema(): Promise<void> {
    await loadSchemas();
  }

  override valueSetExpand(params: ValueSetExpandParams): ReadablePromise<ValueSet> {
    const promise = (async () => {
      const result = await expandValueSet(params.url ?? '', params.filter);
      if (result) {
        return result;
      }
      // Fall back to server-side expansion via proxy
      return await super.valueSetExpand(params);
    })();
    return new ReadablePromise(promise);
  }
}

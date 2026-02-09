// ABOUTME: MedplumClient subclass that routes FHIR operations through the proxy.
// ABOUTME: Overrides schema methods (pre-loaded) and injects auth headers.
import { MedplumClient } from '@medplum/core';

export interface HealthcareMedplumClientConfig {
  getAccessToken: () => string | undefined;
}

export class HealthcareMedplumClient extends MedplumClient {
  constructor(config: HealthcareMedplumClientConfig) {
    const getAccessToken = config.getAccessToken;

    super({
      baseUrl: globalThis.location?.origin ?? 'http://localhost:5173',
      fhirUrlPath: 'fhir',
      fetch: (url: string | URL, init?: RequestInit) => {
        const token = getAccessToken();
        const headers = new Headers(init?.headers);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
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
}

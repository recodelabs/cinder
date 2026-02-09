// ABOUTME: FHIR client that talks to the Vite proxy at /fhir/*.
// ABOUTME: The proxy rewrites URLs to Google Cloud Healthcare API endpoints.
import type { Bundle, OperationOutcome, Resource } from '@medplum/fhirtypes';

export interface HealthcareFhirClientConfig {
  getAccessToken: () => string | undefined;
  baseUrl?: string;
}

export class FhirClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly outcome: OperationOutcome
  ) {
    super(outcome.issue?.[0]?.diagnostics ?? `HTTP ${status}`);
    this.name = 'FhirClientError';
  }
}

export class HealthcareFhirClient {
  readonly baseUrl: string;
  private readonly getAccessToken: () => string | undefined;

  constructor(config: HealthcareFhirClientConfig) {
    this.baseUrl = config.baseUrl ?? '/fhir';
    this.getAccessToken = config.getAccessToken;
  }

  async read<T extends Resource = Resource>(resourceType: string, id: string): Promise<T> {
    return this.request<T>(`${this.baseUrl}/${resourceType}/${id}`);
  }

  async search<T extends Resource = Resource>(
    resourceType: string,
    params?: URLSearchParams
  ): Promise<Bundle<T>> {
    const query = params?.toString();
    const url = query
      ? `${this.baseUrl}/${resourceType}?${query}`
      : `${this.baseUrl}/${resourceType}`;
    return this.request<Bundle<T>>(url);
  }

  async create<T extends Resource = Resource>(resource: T): Promise<T> {
    return this.request<T>(`${this.baseUrl}/${resource.resourceType}`, {
      method: 'POST',
      body: JSON.stringify(resource),
    });
  }

  async update<T extends Resource = Resource>(resource: T): Promise<T> {
    return this.request<T>(`${this.baseUrl}/${resource.resourceType}/${resource.id}`, {
      method: 'PUT',
      body: JSON.stringify(resource),
    });
  }

  async delete(resourceType: string, id: string): Promise<void> {
    await this.request(`${this.baseUrl}/${resourceType}/${id}`, {
      method: 'DELETE',
    });
  }

  async history(resourceType: string, id: string): Promise<Bundle> {
    return this.request<Bundle>(`${this.baseUrl}/${resourceType}/${id}/_history`);
  }

  async everything(patientId: string): Promise<Bundle> {
    return this.request<Bundle>(`${this.baseUrl}/Patient/${patientId}/$everything`);
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const token = this.getAccessToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/fhir+json',
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const outcome = (await response.json()) as OperationOutcome;
      throw new FhirClientError(response.status, outcome);
    }

    return response.json() as Promise<T>;
  }
}

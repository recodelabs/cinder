// ABOUTME: MedplumClient subclass that routes FHIR operations through the proxy.
// ABOUTME: Overrides schema and ValueSet methods for local-first operation.
import { MedplumClient, ReadablePromise, normalizeCreateBinaryOptions } from '@medplum/core';
import type { BinarySource, CreateBinaryOptions, MedplumRequestOptions, ValueSetExpandParams } from '@medplum/core';
import type { Attachment, ValueSet } from '@medplum/fhirtypes';
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
    // Schemas are pre-loaded from @medplum/definitions at startup
    return;
  }

  override async requestProfileSchema(): Promise<void> {
    // Profiles are pre-loaded from @medplum/definitions at startup
    return;
  }

  override createAttachment(options: CreateBinaryOptions, requestOptions?: MedplumRequestOptions): Promise<Attachment>;
  override createAttachment(
    data: BinarySource,
    filename: string | undefined,
    contentType: string,
    onProgress?: (e: ProgressEvent) => void,
    options?: MedplumRequestOptions
  ): Promise<Attachment>;
  override async createAttachment(
    arg1: BinarySource | CreateBinaryOptions,
    arg2?: string | undefined | MedplumRequestOptions,
    arg3?: string,
    arg4?: (e: ProgressEvent) => void
  ): Promise<Attachment> {
    const options = normalizeCreateBinaryOptions(arg1, arg2, arg3, arg4);
    const reqOpts = typeof arg2 === 'object' && arg2 !== null && !('contentType' in (arg2 as CreateBinaryOptions)) ? arg2 as MedplumRequestOptions : undefined;
    const binary = await this.createBinary(options, reqOpts);
    return {
      contentType: options.contentType,
      url: this.fhirUrl('Binary', binary.id).toString(),
      title: options.filename,
    };
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

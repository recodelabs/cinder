// ABOUTME: Shared singleton instances used across route handlers.
// ABOUTME: Exports the GCP token cache and the FHIR server client-credentials token store to avoid circular dependencies.
import { ClientCredentialsTokens } from '../fhir-auth';
import { TokenCache } from '../token-cache';

export const tokenCache = new TokenCache();

/** Bearer tokens for 'fhir' projects with client credentials, keyed by project ID. */
export const fhirServerTokens = new ClientCredentialsTokens();

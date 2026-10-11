// ABOUTME: Pure validation utilities for project routes.
// ABOUTME: Provides slug generation, Zod-based input validation for GCP and generic FHIR server projects, and client-credential update rules.
import { z } from 'zod';
import { isSecureOrLoopbackUrl } from '../fhir-auth';
import { normalizeFhirBaseUrl } from '../fhir-target';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

const baseFields = {
  name: z.string().min(1).max(100),
  slug: z.string().optional(),
  description: z.string().optional(),
};

const gcpProjectSchema = z.object({
  ...baseFields,
  serverType: z.literal('gcp'),
  gcpProject: z.string().min(1),
  gcpLocation: z.string().min(1),
  gcpDataset: z.string().min(1),
  gcpFhirStore: z.string().min(1),
});

const HTTPS_REQUIRED = 'must use https (http is only allowed for localhost)';

/**
 * OAuth client credentials for servers that need a Bearer token. clientSecret may be
 * omitted on update to keep the stored secret; an empty string counts as omitted.
 */
const fhirAuthSchema = z.object({
  tokenUrl: z.url({ protocol: /^https?$/ }).refine(isSecureOrLoopbackUrl, HTTPS_REQUIRED),
  clientId: z.string().trim().min(1).max(255),
  clientSecret: z
    .string()
    .max(4096)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});

const fhirProjectSchema = z
  .object({
    ...baseFields,
    serverType: z.literal('fhir'),
    fhirBaseUrl: z
      .url({ protocol: /^https?$/ })
      .transform(normalizeFhirBaseUrl)
      .pipe(z.string().min(1)),
    fhirAuth: fhirAuthSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.fhirAuth && !isSecureOrLoopbackUrl(value.fhirBaseUrl)) {
      ctx.addIssue({ code: 'custom', path: ['fhirBaseUrl'], message: `${HTTPS_REQUIRED} when client credentials are set` });
    }
  });

/** Older clients omit serverType; they are always GCP projects. */
export const projectInputSchema = z.preprocess(
  (value) =>
    value && typeof value === 'object' && !('serverType' in value)
      ? { ...(value as Record<string, unknown>), serverType: 'gcp' }
      : value,
  z.discriminatedUnion('serverType', [gcpProjectSchema, fhirProjectSchema]),
);

export type ProjectInput = z.infer<typeof projectInputSchema>;

export function validateProjectInput(input: unknown): ProjectInput {
  return projectInputSchema.parse(input);
}

export interface ProjectTargetColumns {
  serverType: 'gcp' | 'fhir';
  fhirBaseUrl: string | null;
  gcpProject: string | null;
  gcpLocation: string | null;
  gcpDataset: string | null;
  gcpFhirStore: string | null;
}

/** Maps validated input onto the project table's target columns, nulling the unused kind. */
export function projectTargetColumns(input: ProjectInput): ProjectTargetColumns {
  if (input.serverType === 'fhir') {
    return {
      serverType: 'fhir',
      fhirBaseUrl: input.fhirBaseUrl,
      gcpProject: null,
      gcpLocation: null,
      gcpDataset: null,
      gcpFhirStore: null,
    };
  }
  return {
    serverType: 'gcp',
    fhirBaseUrl: null,
    gcpProject: input.gcpProject,
    gcpLocation: input.gcpLocation,
    gcpDataset: input.gcpDataset,
    gcpFhirStore: input.gcpFhirStore,
  };
}

export interface StoredFhirAuth {
  readonly tokenUrl: string;
  readonly clientId: string;
}

export type FhirCredentialPlan =
  | { readonly action: 'remove' }
  | { readonly action: 'keep' }
  | { readonly action: 'save'; readonly tokenUrl: string; readonly clientId: string; readonly clientSecret: string }
  | { readonly action: 'reject'; readonly error: string };

/**
 * Decides what to do with a project's stored client credentials. A stored secret is
 * only kept when the token URL and client ID are unchanged, so nobody can redirect
 * an existing secret to a different token endpoint without knowing it.
 */
export function planFhirCredential(input: ProjectInput, stored: StoredFhirAuth | undefined): FhirCredentialPlan {
  if (input.serverType !== 'fhir' || !input.fhirAuth) {
    return { action: 'remove' };
  }
  const { tokenUrl, clientId, clientSecret } = input.fhirAuth;
  if (clientSecret) {
    return { action: 'save', tokenUrl, clientId, clientSecret };
  }
  if (!stored) {
    return { action: 'reject', error: 'fhirAuth.clientSecret: Required' };
  }
  if (stored.tokenUrl !== tokenUrl || stored.clientId !== clientId) {
    return { action: 'reject', error: 'fhirAuth.clientSecret: Enter the secret again when the token URL or client ID changes' };
  }
  return { action: 'keep' };
}

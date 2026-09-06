// ABOUTME: Pure validation utilities for project routes.
// ABOUTME: Provides slug generation and Zod-based input validation for GCP and generic FHIR server projects.
import { z } from 'zod';
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

const fhirProjectSchema = z.object({
  ...baseFields,
  serverType: z.literal('fhir'),
  fhirBaseUrl: z
    .url({ protocol: /^https?$/ })
    .transform(normalizeFhirBaseUrl)
    .pipe(z.string().min(1)),
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

// ABOUTME: Pure validation utilities for project routes.
// ABOUTME: Provides slug generation and Zod-based input validation without database dependencies.
import { z } from 'zod';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const projectInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().optional(),
  description: z.string().optional(),
  gcpProject: z.string().min(1),
  gcpLocation: z.string().min(1),
  gcpDataset: z.string().min(1),
  gcpFhirStore: z.string().min(1),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export function validateProjectInput(input: unknown): ProjectInput {
  return projectInputSchema.parse(input);
}

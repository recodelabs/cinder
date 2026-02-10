// ABOUTME: Tests for error message sanitization.
// ABOUTME: Verifies GCP resource paths are stripped from user-facing messages.
import { describe, expect, it } from 'vitest';
import { safeErrorMessage } from './errors';

describe('safeErrorMessage', () => {
  it('returns the message for simple errors', () => {
    expect(safeErrorMessage(new Error('Not found'))).toBe('Not found');
  });

  it('strips GCP resource paths', () => {
    const msg = 'FHIR store projects/my-proj/locations/us-central1/datasets/ds/fhirStores/store/ returned 403';
    expect(safeErrorMessage(new Error(msg))).toBe('FHIR store returned 403');
  });

  it('returns fallback for empty message', () => {
    expect(safeErrorMessage(new Error(''))).toBe('An unexpected error occurred');
  });
});

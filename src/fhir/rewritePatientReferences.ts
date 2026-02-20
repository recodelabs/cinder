// ABOUTME: Utility to deep-walk a FHIR resource and replace patient references.
// ABOUTME: Used by bulk load to re-target all resources to a chosen patient.
import type { Resource } from '@medplum/fhirtypes';

/**
 * Deep-walks a FHIR resource and replaces all references to source patient IDs
 * with a reference to the target patient. Handles both `Patient/id` and
 * `urn:uuid:id` reference formats.
 */
export function rewritePatientReferences(
  resource: Resource,
  sourcePatientIds: string[],
  targetPatientId: string
): Resource {
  if (sourcePatientIds.length === 0) {
    return resource;
  }
  const targetRef = `Patient/${targetPatientId}`;
  const copy = JSON.parse(JSON.stringify(resource)) as Resource;
  walkAndReplace(copy, sourcePatientIds, targetRef);
  return copy;
}

function walkAndReplace(
  obj: unknown,
  sourceIds: string[],
  targetRef: string
): void {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      walkAndReplace(item, sourceIds, targetRef);
    }
    return;
  }

  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === 'string') {
      if (key === 'reference') {
        const replaced = replaceReference(value, sourceIds, targetRef);
        if (replaced !== value) {
          record[key] = replaced;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      walkAndReplace(value, sourceIds, targetRef);
    }
  }
}

function replaceReference(
  ref: string,
  sourceIds: string[],
  targetRef: string
): string {
  for (const id of sourceIds) {
    if (ref === `Patient/${id}` || ref === `urn:uuid:${id}`) {
      return targetRef;
    }
  }
  return ref;
}

/**
 * Extracts patient IDs from a list of resources. Returns both the `id` field
 * of Patient resources and any `urn:uuid:` fullUrls associated with them.
 */
export function extractPatientIds(
  resources: Resource[],
  fullUrls: Map<Resource, string>
): string[] {
  const ids: string[] = [];
  for (const r of resources) {
    if (r.resourceType === 'Patient') {
      if (r.id) {
        ids.push(r.id);
      }
      const fullUrl = fullUrls.get(r);
      if (fullUrl?.startsWith('urn:uuid:')) {
        ids.push(fullUrl.slice('urn:uuid:'.length));
      }
    }
  }
  return ids;
}

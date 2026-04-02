// ABOUTME: Generalized FHIR reference rewriter for any resource type.
// ABOUTME: Deep-walks a resource JSON tree and replaces matching reference fields.
import type { Resource } from '@medplum/fhirtypes';

export function rewriteReferences(
  resource: Resource,
  sourceIds: string[],
  targetId: string,
  resourceType: string
): Resource | null {
  if (sourceIds.length === 0) {
    return null;
  }

  const targetRef = `${resourceType}/${targetId}`;
  const sourceRefs = new Set(sourceIds.map((id) => `${resourceType}/${id}`));

  const copy = JSON.parse(JSON.stringify(resource)) as Resource;
  const changed = walkAndReplace(copy, sourceRefs, targetRef);

  return changed ? copy : null;
}

function walkAndReplace(
  obj: unknown,
  sourceRefs: Set<string>,
  targetRef: string
): boolean {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return false;
  }

  if (Array.isArray(obj)) {
    let changed = false;
    for (const item of obj) {
      if (walkAndReplace(item, sourceRefs, targetRef)) {
        changed = true;
      }
    }
    return changed;
  }

  const record = obj as Record<string, unknown>;
  let changed = false;

  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === 'string' && key === 'reference') {
      if (sourceRefs.has(value)) {
        record[key] = targetRef;
        changed = true;
      }
    } else if (typeof value === 'object' && value !== null) {
      if (walkAndReplace(value, sourceRefs, targetRef)) {
        changed = true;
      }
    }
  }

  return changed;
}

// ABOUTME: Duplicate detection logic using Double Metaphone phonetic matching.
// ABOUTME: Groups FHIR resources by phonetically similar names to surface duplicate candidates.
import { doubleMetaphone } from 'double-metaphone';
import type { Resource } from '@medplum/fhirtypes';

interface HumanNameResource extends Resource {
  readonly name?: ReadonlyArray<{
    readonly family?: string;
    readonly given?: readonly string[];
  }>;
}

interface StringNameResource extends Resource {
  readonly name?: string;
}

export interface DuplicateGroup {
  readonly phoneticKey: string;
  readonly displayName: string;
  readonly resources: Resource[];
}

export function extractDisplayName(resource: Resource): string {
  if (resource.resourceType === 'Organization') {
    return (resource as StringNameResource).name ?? '';
  }

  const humanNameResource = resource as HumanNameResource;
  const nameEntry = humanNameResource.name?.[0];
  if (!nameEntry) {
    return '';
  }

  const parts: string[] = [];
  if (nameEntry.family) {
    parts.push(nameEntry.family);
  }
  if (nameEntry.given) {
    parts.push(...nameEntry.given);
  }
  return parts.join(' ');
}

function phoneticKey(name: string): string {
  if (!name) {
    return '';
  }
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.map((part) => doubleMetaphone(part)[0]).join('|');
}

export function groupByPhoneticCode(resources: Resource[]): DuplicateGroup[] {
  const groups = new Map<string, { displayName: string; resources: Resource[] }>();

  for (const resource of resources) {
    const name = extractDisplayName(resource);
    if (!name) {
      continue;
    }

    const key = phoneticKey(name);
    if (!key) {
      continue;
    }

    const existing = groups.get(key);
    if (existing) {
      existing.resources.push(resource);
    } else {
      groups.set(key, { displayName: name, resources: [resource] });
    }
  }

  return Array.from(groups.entries())
    .filter(([, group]) => group.resources.length >= 2)
    .sort((a, b) => b[1].resources.length - a[1].resources.length)
    .map(([key, group]) => ({
      phoneticKey: key,
      displayName: group.displayName,
      resources: group.resources,
    }));
}

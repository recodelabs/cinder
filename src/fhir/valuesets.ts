// ABOUTME: Local ValueSet expansion using bundled FHIR R4 definitions.
// ABOUTME: Resolves ValueSet compose.include against CodeSystem concepts without a server.
import type { Bundle, CodeSystem, ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import valueSetsBundle from 'fhir-definitions/r4/valuesets.json';
import v3CodeSystemsBundle from 'fhir-definitions/r4/v3-codesystems.json';
import v2TablesBundle from 'fhir-definitions/r4/v2-tables.json';

const codeSystemIndex = new Map<string, CodeSystem>();
const valueSetIndex = new Map<string, ValueSet>();

let indexed = false;

function ensureIndexed(): void {
  if (indexed) {
    return;
  }
  for (const bundle of [valueSetsBundle, v3CodeSystemsBundle, v2TablesBundle] as unknown as Bundle[]) {
    for (const entry of bundle.entry ?? []) {
      const resource = entry.resource;
      if (!resource?.url) {
        continue;
      }
      if (resource.resourceType === 'CodeSystem') {
        codeSystemIndex.set(resource.url, resource as CodeSystem);
      } else if (resource.resourceType === 'ValueSet') {
        valueSetIndex.set(resource.url, resource as ValueSet);
      }
    }
  }
  indexed = true;
}

function collectConcepts(cs: CodeSystem, concepts: CodeSystem['concept'], results: ValueSetExpansionContains[]): void {
  for (const concept of concepts ?? []) {
    results.push({
      system: cs.url,
      code: concept.code,
      display: concept.display ?? concept.code,
    });
    if (concept.concept) {
      collectConcepts(cs, concept.concept, results);
    }
  }
}

export function expandValueSet(url: string, filter?: string): ValueSet | undefined {
  ensureIndexed();
  const vs = valueSetIndex.get(url);
  if (!vs) {
    return undefined;
  }

  const contains: ValueSetExpansionContains[] = [];

  for (const include of vs.compose?.include ?? []) {
    const cs = codeSystemIndex.get(include.system ?? '');
    if (!cs) {
      continue;
    }

    if (include.concept && include.concept.length > 0) {
      // Explicit concept list — only include those specific codes
      for (const ref of include.concept) {
        const full = findConcept(cs.concept ?? [], ref.code);
        contains.push({
          system: cs.url,
          code: ref.code,
          display: full?.display ?? ref.display ?? ref.code,
        });
      }
    } else {
      // Include all concepts from the CodeSystem
      collectConcepts(cs, cs.concept, contains);
    }
  }

  const filtered = filter
    ? contains.filter(
        (c) =>
          c.code?.toLowerCase().includes(filter.toLowerCase()) ||
          c.display?.toLowerCase().includes(filter.toLowerCase())
      )
    : contains;

  return {
    resourceType: 'ValueSet',
    url: vs.url,
    expansion: {
      timestamp: new Date().toISOString(),
      contains: filtered,
    },
  };
}

function findConcept(
  concepts: NonNullable<CodeSystem['concept']>,
  code: string
): NonNullable<CodeSystem['concept']>[number] | undefined {
  for (const concept of concepts) {
    if (concept.code === code) {
      return concept;
    }
    if (concept.concept) {
      const found = findConcept(concept.concept, code);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

// ABOUTME: Local ValueSet expansion using bundled FHIR R4 definitions.
// ABOUTME: Resolves ValueSet compose.include against CodeSystem concepts without a server.
import type { Bundle, CodeSystem, ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';

const codeSystemIndex = new Map<string, CodeSystem>();
const valueSetIndex = new Map<string, ValueSet>();

let indexed = false;

async function ensureIndexed(): Promise<void> {
  if (indexed) {
    return;
  }
  const [valueSetsBundle, v3CodeSystemsBundle, v2TablesBundle] = await Promise.all([
    import('fhir-definitions/r4/valuesets.json'),
    import('fhir-definitions/r4/v3-codesystems.json'),
    import('fhir-definitions/r4/v2-tables.json'),
  ]);
  for (const bundle of [valueSetsBundle.default, v3CodeSystemsBundle.default, v2TablesBundle.default] as unknown as Bundle[]) {
    for (const entry of bundle.entry ?? []) {
      const resource = entry.resource as (CodeSystem | ValueSet) | undefined;
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

export async function expandValueSet(url: string, filter?: string): Promise<ValueSet | undefined> {
  await ensureIndexed();
  const bareUrl = url.split('|')[0] ?? url;
  const vs = valueSetIndex.get(bareUrl);
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
    status: 'active',
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

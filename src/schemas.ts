// ABOUTME: Loads FHIR R4 StructureDefinitions and SearchParameters into memory.
// ABOUTME: Must be called once at app startup before rendering FHIR components.
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';

let loaded = false;

export function loadSchemas(): void {
  if (loaded) {
    return;
  }
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);

  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
  }

  loaded = true;
}

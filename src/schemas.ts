// ABOUTME: Loads FHIR R4 StructureDefinitions and SearchParameters into memory.
// ABOUTME: Uses dynamic imports so definitions are code-split into separate cached chunks.
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';

let loaded = false;

export async function loadSchemas(): Promise<void> {
  if (loaded) {
    return;
  }
  const [
    profilesTypes,
    profilesResources,
    searchParameters,
    searchParametersMedplum,
    searchParametersUscore,
  ] = await Promise.all([
    import('fhir-definitions/r4/profiles-types.json'),
    import('fhir-definitions/r4/profiles-resources.json'),
    import('fhir-definitions/r4/search-parameters.json'),
    import('fhir-definitions/r4/search-parameters-medplum.json'),
    import('fhir-definitions/r4/search-parameters-uscore.json'),
  ]);
  indexStructureDefinitionBundle(profilesTypes.default as unknown as Bundle);
  indexStructureDefinitionBundle(profilesResources.default as unknown as Bundle);
  indexSearchParameterBundle(searchParameters.default as unknown as Bundle<SearchParameter>);
  indexSearchParameterBundle(searchParametersMedplum.default as unknown as Bundle<SearchParameter>);
  indexSearchParameterBundle(searchParametersUscore.default as unknown as Bundle<SearchParameter>);
  loaded = true;
}

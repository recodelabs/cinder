// ABOUTME: Loads FHIR R4 StructureDefinitions and SearchParameters into memory.
// ABOUTME: Must be called once at app startup before rendering FHIR components.
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import profilesTypes from 'fhir-definitions/r4/profiles-types.json';
import profilesResources from 'fhir-definitions/r4/profiles-resources.json';
import searchParameters from 'fhir-definitions/r4/search-parameters.json';
import searchParametersMedplum from 'fhir-definitions/r4/search-parameters-medplum.json';
import searchParametersUscore from 'fhir-definitions/r4/search-parameters-uscore.json';

let loaded = false;

export function loadSchemas(): void {
  if (loaded) {
    return;
  }
  indexStructureDefinitionBundle(profilesTypes as unknown as Bundle);
  indexStructureDefinitionBundle(profilesResources as unknown as Bundle);
  indexSearchParameterBundle(searchParameters as unknown as Bundle<SearchParameter>);
  indexSearchParameterBundle(searchParametersMedplum as unknown as Bundle<SearchParameter>);
  indexSearchParameterBundle(searchParametersUscore as unknown as Bundle<SearchParameter>);
  loaded = true;
}

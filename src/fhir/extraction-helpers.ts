// ABOUTME: Orchestration helpers for FHIR resource extraction from QuestionnaireResponses.
// ABOUTME: Reads extraction templates from Questionnaire extensions and runs the template engine.
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { resolveTemplate } from './extraction';

export const EXTRACTION_EXTENSION_URL = 'http://beda.software/fhir-extensions/fhir-path-mapping-language';

/**
 * Reads the extraction template from a Questionnaire's extensions.
 * Returns the parsed template array, or null if not configured or invalid.
 */
export function getExtractionTemplate(
  questionnaire: Questionnaire,
): Record<string, unknown>[] | null {
  const ext = questionnaire.extension?.find((e) => e.url === EXTRACTION_EXTENSION_URL);
  if (!ext?.valueString) return null;
  try {
    const parsed = JSON.parse(ext.valueString);
    if (!Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>[];
  } catch {
    return null;
  }
}

/**
 * Runs extraction: resolves each template in the array against the QR.
 * Returns an array of FHIR resources to create. Does NOT create them.
 */
export function runExtraction(
  questionnaire: Questionnaire,
  questionnaireResponse: QuestionnaireResponse,
): Record<string, unknown>[] {
  const templates = getExtractionTemplate(questionnaire);
  if (!templates) return [];

  const context = { QuestionnaireResponse: questionnaireResponse };
  const results: Record<string, unknown>[] = [];

  for (const template of templates) {
    const result = resolveTemplate(
      questionnaireResponse as unknown as Record<string, unknown>,
      template,
      context,
    );
    if (result && Object.keys(result).filter((k) => k !== 'resourceType').length > 0) {
      results.push(result);
    }
  }

  return results;
}

// ABOUTME: Extracts user-safe error messages from API responses.
// ABOUTME: Strips internal GCP resource paths to avoid leaking infrastructure details.

const GCP_PATH_PATTERN =
  /projects\/[\w-]+\/locations\/[\w-]+\/datasets\/[\w-]+\/fhirStores\/[\w-]+\/?/g;

export function safeErrorMessage(error: Error): string {
  const message = error.message || 'An unexpected error occurred';
  return message.replace(GCP_PATH_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

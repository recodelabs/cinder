// ABOUTME: Global test setup for Vitest.
// ABOUTME: Loads FHIR schemas so components can resolve types in tests.
import { loadSchemas } from './schemas';

loadSchemas();

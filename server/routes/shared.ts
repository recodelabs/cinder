// ABOUTME: Shared singleton instances used across route handlers.
// ABOUTME: Exports the token cache instance to avoid circular dependencies.
import { TokenCache } from '../token-cache';

export const tokenCache = new TokenCache();

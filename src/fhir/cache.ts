// ABOUTME: LRU cache for resolved FHIR references.
// ABOUTME: Prevents redundant fetches when the same resource is referenced multiple times.
import type { Resource } from '@medplum/fhirtypes';

export class ReferenceCache {
  private readonly cache = new Map<string, Resource>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): Resource | undefined {
    const value = this.cache.get(key);
    if (value) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: Resource): void {
    this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

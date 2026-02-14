// ABOUTME: Global test setup for Vitest.
// ABOUTME: Loads FHIR schemas and polyfills browser APIs missing from jsdom.
import { loadSchemas } from './schemas';

await loadSchemas();

global.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

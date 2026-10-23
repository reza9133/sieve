import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// jsdom has no Web Crypto subtle digest in every Node/jsdom combination; use Node's.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

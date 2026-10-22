import '@testing-library/jest-dom'
import { webcrypto } from 'crypto'

// Ensure Web Crypto is available in tests
if (!globalThis.crypto) {
  // @ts-expect-error Node webcrypto type compatibility
  globalThis.crypto = webcrypto
}
if (!globalThis.crypto.subtle) {
  // @ts-expect-error Node webcrypto subtle
  globalThis.crypto.subtle = webcrypto.subtle
}

import { describe, it, expect } from 'vitest'
import {
  validateHttpsUrl,
  validateTenderId,
  validateSalt,
  validateHash,
  validateAddress,
  validateEconomics,
  validateLimits,
  decodeFailedMask,
} from '@/lib/validation'

describe('Input Validation (Mirroring contracts/sieve.py)', () => {
  describe('HTTPS URL Validation (_host)', () => {
    it('accepts valid HTTPS URLs', () => {
      expect(validateHttpsUrl('https://example.com/spec.md').valid).toBe(true)
      expect(validateHttpsUrl('https://raw.githubusercontent.com/user/repo/main/doc.txt').valid).toBe(true)
      expect(validateHttpsUrl('https://ipfs.io:443/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco').valid).toBe(true)
    })

    it('rejects HTTP and non-HTTPS protocols', () => {
      expect(validateHttpsUrl('http://example.com/spec.md').valid).toBe(false)
      expect(validateHttpsUrl('ftp://example.com/spec.md').valid).toBe(false)
    })

    it('rejects localhost, local, internal, test domains', () => {
      expect(validateHttpsUrl('https://localhost/spec.md').valid).toBe(false)
      expect(validateHttpsUrl('https://node.localhost/spec.md').valid).toBe(false)
      expect(validateHttpsUrl('https://mytest.local/spec.md').valid).toBe(false)
      expect(validateHttpsUrl('https://company.internal/spec.md').valid).toBe(false)
      expect(validateHttpsUrl('https://service.test/spec.md').valid).toBe(false)
    })

    it('rejects IP literals', () => {
      expect(validateHttpsUrl('https://127.0.0.1/spec.md').valid).toBe(false)
      expect(validateHttpsUrl('https://192.168.1.1/spec.md').valid).toBe(false)
      expect(validateHttpsUrl('https://[::1]/spec.md').valid).toBe(false)
    })

    it('rejects URLs with credentials, non-443 ports, or fragments', () => {
      expect(validateHttpsUrl('https://user:pass@example.com/spec.md').valid).toBe(false)
      expect(validateHttpsUrl('https://example.com:8080/spec.md').valid).toBe(false)
      expect(validateHttpsUrl('https://example.com/spec.md#section1').valid).toBe(false)
    })

    it('rejects URLs with spaces or control characters', () => {
      expect(validateHttpsUrl('https://example.com/spec file.md').valid).toBe(false)
      expect(validateHttpsUrl('https://example.com/\nspec.md').valid).toBe(false)
    })
  })

  describe('Tender ID Validation', () => {
    it('accepts compliant IDs', () => {
      expect(validateTenderId('tender-001').valid).toBe(true)
      expect(validateTenderId('audit_web3.v1').valid).toBe(true)
      expect(validateTenderId('A123').valid).toBe(true)
    })

    it('rejects invalid IDs', () => {
      expect(validateTenderId('-invalid').valid).toBe(false)
      expect(validateTenderId('_invalid').valid).toBe(false)
      expect(validateTenderId('').valid).toBe(false)
      expect(validateTenderId('tender with space').valid).toBe(false)
      expect(validateTenderId('a'.repeat(65)).valid).toBe(false)
    })
  })

  describe('Salt Validation', () => {
    it('accepts valid salts', () => {
      expect(validateSalt('abcdefghijklmnop0123456789ABCDEF').valid).toBe(true)
      expect(validateSalt('a'.repeat(16)).valid).toBe(true)
      expect(validateSalt('a'.repeat(64)).valid).toBe(true)
    })

    it('rejects invalid salts', () => {
      expect(validateSalt('short').valid).toBe(false) // < 16 chars
      expect(validateSalt('a'.repeat(65)).valid).toBe(false) // > 64 chars
      expect(validateSalt('salt with spaces!!').valid).toBe(false)
    })
  })

  describe('Hash & Address Validation', () => {
    it('validates 0x + 64 hex characters', () => {
      expect(validateHash('0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19').valid).toBe(true)
      expect(validateHash('94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19').valid).toBe(false)
      expect(validateHash('0x1234').valid).toBe(false)
    })

    it('validates Ethereum addresses', () => {
      expect(validateAddress('0x1111111111111111111111111111111111111111').valid).toBe(true)
      expect(validateAddress('0x0000000000000000000000000000000000000000').valid).toBe(false) // zero address prohibited
      expect(validateAddress('0x123').valid).toBe(false)
    })
  })

  describe('Economics & Limits', () => {
    it('validates budget and bond constraints', () => {
      expect(validateEconomics(1000000000000000n, 100000000000000n).valid).toBe(true) // min values
      expect(validateEconomics(100000000000000n, 100000000000000n).valid).toBe(false) // budget < min
      expect(validateEconomics(1000000000000000n, 2000000000000000n).valid).toBe(false) // bond > budget
    })

    it('validates requirement count and max bids', () => {
      expect(validateLimits(1, 1).valid).toBe(true)
      expect(validateLimits(8, 16).valid).toBe(true)
      expect(validateLimits(0, 5).valid).toBe(false)
      expect(validateLimits(9, 5).valid).toBe(false)
      expect(validateLimits(5, 17).valid).toBe(false)
    })
  })

  describe('failed_mask Bitmask Decoding', () => {
    it('decodes requirement numbers accurately (1-indexed)', () => {
      // Bit 0 = requirement 1 (value 1)
      expect(decodeFailedMask(1, 5)).toEqual([1])
      // Bit 1 = requirement 2 (value 2)
      expect(decodeFailedMask(2, 5)).toEqual([2])
      // Bit 0 and Bit 2 = requirements 1 and 3 (value 1 | 4 = 5)
      expect(decodeFailedMask(5, 5)).toEqual([1, 3])
      // 0 = no failed requirements
      expect(decodeFailedMask(0, 8)).toEqual([])
      // All 8 failed (value 255)
      expect(decodeFailedMask(255, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })
  })
})

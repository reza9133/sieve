import { describe, it, expect } from 'vitest'
import {
  computeCommitment,
  sha256Hex,
  generateSalt,
  tenderKey,
} from '@/lib/commitment'
import { SALT_REGEX } from '@/lib/validation'

describe('Commitment & Hashing Core (Golden Vector Verification)', () => {
  it('computes sha256("hello sieve") matching proposal_hash golden vector', async () => {
    const hash = await sha256Hex('hello sieve')
    expect(hash).toBe('0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19')
  })

  it('computes byte-exact commitment matching Python golden vector', async () => {
    const funder = '0x1111111111111111111111111111111111111111'
    const tenderId = 'tender-001'
    const bidderMixed = '0xAbCdEf0123456789aBcDeF0123456789abcdef01'
    const priceWei = 2500000000000000n // 0.0025 GEN
    const proposalUrl = 'https://example.com/proposal.md'
    const proposalHash = '0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19'
    const salt = 'abcdefghijklmnop0123456789ABCDEF'

    const expectedCommitment =
      '0xab8d116e4a3d62a3d9058ee7424eb2a613b7152418af8350b6d6b9f4a3e19466'

    // Compute with mixed case bidder
    const commitmentMixed = await computeCommitment({
      funderAddress: funder,
      tenderId,
      bidderAddress: bidderMixed,
      priceWei,
      proposalUrl,
      proposalHash,
      salt,
    })

    expect(commitmentMixed).toBe(expectedCommitment)

    // Compute with lowercase bidder (must be identical)
    const commitmentLower = await computeCommitment({
      funderAddress: funder,
      tenderId,
      bidderAddress: bidderMixed.toLowerCase(),
      priceWei,
      proposalUrl,
      proposalHash,
      salt,
    })

    expect(commitmentLower).toBe(expectedCommitment)
  })

  it('builds canonical tender key', () => {
    expect(tenderKey('0xAbCdEf', 'tender-123')).toBe('0xabcdef:tender-123')
  })

  it('generates cryptographically random salt conforming to contract regex', () => {
    for (let i = 0; i < 10; i++) {
      const salt = generateSalt()
      expect(salt.length).toBeGreaterThanOrEqual(16)
      expect(salt.length).toBeLessThanOrEqual(64)
      expect(SALT_REGEX.test(salt)).toBe(true)
    }
  })
})

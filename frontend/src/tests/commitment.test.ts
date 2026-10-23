import { describe, expect, it } from 'vitest';
import { computeCommitment, encodeFields, generateSalt, sha256Hex, tenderKey } from '@/lib/commitment';
import { hashText } from '@/lib/hash';
import { validateSalt } from '@/lib/validation';

// Golden vector produced by scripts/sieve_tools.py `commitment()` in this repo.
const vector = {
  funder: '0x1111111111111111111111111111111111111111',
  tenderId: 'tender-001',
  bidder: '0xAbCdEf0123456789aBcDeF0123456789abcdef01',
  priceWei: 2500000000000000n,
  proposalUrl: 'https://example.com/proposal.md',
  proposalHash: '0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19',
  salt: 'abcdefghijklmnop0123456789ABCDEF',
};
const EXPECTED = '0xab8d116e4a3d62a3d9058ee7424eb2a613b7152418af8350b6d6b9f4a3e19466';

describe('commitment', () => {
  it('matches the golden vector from scripts/sieve_tools.py', async () => {
    expect(await computeCommitment(vector)).toBe(EXPECTED);
  });

  it('gives the identical result for the lowercase bidder and funder', async () => {
    const lower = { ...vector, bidder: vector.bidder.toLowerCase(), funder: vector.funder.toLowerCase() };
    expect(await computeCommitment(lower)).toBe(EXPECTED);
    expect(await computeCommitment({ ...vector, funder: '0X1111111111111111111111111111111111111111'.replace('0X', '0x') })).toBe(EXPECTED);
  });

  it('proposal hash is SHA-256 of "hello sieve"', async () => {
    expect(await hashText('hello sieve')).toBe(vector.proposalHash);
  });

  it('is sensitive to every field', async () => {
    const variants = [
      { ...vector, priceWei: vector.priceWei + 1n },
      { ...vector, proposalUrl: `${vector.proposalUrl}x` },
      { ...vector, salt: `${vector.salt}x` },
      { ...vector, tenderId: 'tender-002' },
      { ...vector, bidder: '0x0000000000000000000000000000000000000001' },
    ];
    for (const v of variants) expect(await computeCommitment(v)).not.toBe(EXPECTED);
  });

  it('rejects a non-positive price', async () => {
    await expect(computeCommitment({ ...vector, priceWei: 0n })).rejects.toThrow();
  });

  it('length-prefixes by UTF-8 byte length, big endian', () => {
    const bytes = encodeFields(['a', 'é']); // "é" is 2 bytes in UTF-8
    expect([...bytes]).toEqual([0, 0, 0, 1, 97, 0, 0, 0, 2, 0xc3, 0xa9]);
  });

  it('builds the tender key from the lowercase funder', () => {
    expect(tenderKey('0xABCDEF0123456789ABCDEF0123456789ABCDEF01', 'x')).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01:x',
    );
  });

  it('sha256 of empty input is the well-known digest', async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('salt', () => {
  it('is 43 base64url characters accepted by the contract pattern and unique', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(validateSalt(a)).toBeNull();
    expect(a).not.toBe(b);
  });
});

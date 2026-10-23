import { describe, expect, it } from 'vitest';
import { formatGen, formatWei, parseGen } from '@/lib/units';

describe('units', () => {
  it('parses decimals exactly', () => {
    expect(parseGen('1')).toBe(10n ** 18n);
    expect(parseGen('0.001')).toBe(10n ** 15n);
    expect(parseGen('0.0001')).toBe(10n ** 14n);
    expect(parseGen('.5')).toBe(5n * 10n ** 17n);
    expect(parseGen('0.000000000000000001')).toBe(1n);
    expect(parseGen('  2.5 ')).toBe(25n * 10n ** 17n);
    expect(parseGen('1.')).toBe(10n ** 18n); // trailing dot while typing
  });

  it('rejects malformed input', () => {
    for (const bad of ['', '-1', '1e3', '1,5', '0.0000000000000000001', 'abc', '..1', '0x10']) {
      expect(parseGen(bad)).toBeNull();
    }
  });

  it('round-trips without float error', () => {
    for (const wei of [0n, 1n, 999n, 10n ** 15n, 2500000000000000n, 123456789012345678901234567890n]) {
      expect(parseGen(formatGen(wei).replace(/,/g, ''))).toBe(wei);
    }
  });

  it('formats with grouping and trims zeros', () => {
    expect(formatGen(1234n * 10n ** 18n)).toBe('1,234');
    expect(formatGen(2500000000000000n)).toBe('0.0025');
    expect(formatGen(0n)).toBe('0');
  });

  it('truncates, never rounds up, and flags tiny non-zero amounts', () => {
    expect(formatGen(1999999999999999999n, { maxDecimals: 2 })).toBe('1.99');
    expect(formatGen(1n, { maxDecimals: 4 })).toBe('<0.0001');
  });

  it('formats exact wei', () => {
    expect(formatWei(2500000000000000n)).toBe('2,500,000,000,000,000 wei');
  });
});

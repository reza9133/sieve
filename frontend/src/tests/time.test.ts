import { describe, expect, it } from 'vitest';
import { decodeFailedMask, formatDuration, nextBoundary, phaseAt } from '@/lib/time';

const w = { commit_by: 1000n, reveal_by: 2000n, review_by: 2000n + 3n * 86400n };

describe('phaseAt exact boundaries', () => {
  it('bidding until commit_by (exclusive)', () => {
    expect(phaseAt(0n, w)).toBe('bidding');
    expect(phaseAt(999n, w)).toBe('bidding');
    expect(phaseAt(1000n, w)).toBe('reveal');
  });
  it('reveal until reveal_by (exclusive)', () => {
    expect(phaseAt(1999n, w)).toBe('reveal');
    expect(phaseAt(2000n, w)).toBe('screening');
  });
  it('screening until review_by (exclusive)', () => {
    expect(phaseAt(w.review_by - 1n, w)).toBe('screening');
    expect(phaseAt(w.review_by, w)).toBe('closed');
  });
  it('next boundary follows the phase', () => {
    expect(nextBoundary(999n, w)?.at).toBe(1000n);
    expect(nextBoundary(1000n, w)?.at).toBe(2000n);
    expect(nextBoundary(2000n, w)?.at).toBe(w.review_by);
    expect(nextBoundary(w.review_by, w)).toBeNull();
  });
});

describe('failed_mask', () => {
  it('bit i means requirement i+1 was not_met', () => {
    expect(decodeFailedMask(0)).toEqual([]);
    expect(decodeFailedMask(1)).toEqual([1]);
    expect(decodeFailedMask(4)).toEqual([3]); // live report: charlie failed the third requirement
    expect(decodeFailedMask(0b10100101)).toEqual([1, 3, 6, 8]);
    expect(decodeFailedMask(0xffff)).toHaveLength(16);
  });
  it('honours the requirement count', () => {
    expect(decodeFailedMask(0b1000, 3)).toEqual([]);
  });
});

describe('formatDuration', () => {
  it('drops leading zero units', () => {
    expect(formatDuration(5n)).toBe('5s');
    expect(formatDuration(65n)).toBe('1m 5s');
    expect(formatDuration(3661n)).toBe('1h 1m 1s');
    expect(formatDuration(90061n)).toBe('1d 1h 1m 1s');
    expect(formatDuration(-3n)).toBe('0s');
  });
});

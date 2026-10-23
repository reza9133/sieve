export type Phase = 'bidding' | 'reveal' | 'screening' | 'closed';

export interface Windows {
  commit_by: bigint;
  reveal_by: bigint;
  review_by: bigint;
}

export function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/**
 * Exact boundaries from contracts/sieve.py:
 * bidding   now <  commit_by
 * reveal    commit_by <= now < reveal_by
 * screening reveal_by <= now < review_by
 * closed    now >= review_by
 */
export function phaseAt(now: bigint, w: Windows): Phase {
  if (now < w.commit_by) return 'bidding';
  if (now < w.reveal_by) return 'reveal';
  if (now < w.review_by) return 'screening';
  return 'closed';
}

/** The next boundary after `now`, or null once review_by has passed. */
export function nextBoundary(now: bigint, w: Windows): { label: string; at: bigint } | null {
  if (now < w.commit_by) return { label: 'Bidding closes', at: w.commit_by };
  if (now < w.reveal_by) return { label: 'Reveal window closes', at: w.reveal_by };
  if (now < w.review_by) return { label: 'Screening window closes', at: w.review_by };
  return null;
}

export const PHASE_ORDER: Phase[] = ['bidding', 'reveal', 'screening', 'closed'];

export const PHASE_LABEL: Record<Phase, string> = {
  bidding: 'Bidding',
  reveal: 'Reveal',
  screening: 'Screening',
  closed: 'Review ended',
};

/** "2d 3h 4m 5s", dropping leading zero units. */
export function formatDuration(totalSeconds: bigint): string {
  let s = totalSeconds < 0n ? 0n : totalSeconds;
  const d = s / 86400n;
  s %= 86400n;
  const h = s / 3600n;
  s %= 3600n;
  const m = s / 60n;
  s %= 60n;
  const parts: string[] = [];
  if (d > 0n) parts.push(`${d}d`);
  if (d > 0n || h > 0n) parts.push(`${h}h`);
  if (d > 0n || h > 0n || m > 0n) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export function formatUnix(seconds: bigint): { local: string; utc: string } {
  const date = new Date(Number(seconds) * 1000);
  if (Number.isNaN(date.getTime())) return { local: 'n/a', utc: 'n/a' };
  return {
    local: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }),
    utc: `${date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')} UTC`,
  };
}

/** Bit i (0-indexed) set means requirement i+1 was `not_met`. */
export function decodeFailedMask(mask: number | bigint, requirementCount = 16): number[] {
  const value = BigInt(mask);
  const failed: number[] = [];
  const limit = Math.min(Math.max(requirementCount, 0), 16);
  for (let i = 0; i < limit; i += 1) {
    if ((value >> BigInt(i)) & 1n) failed.push(i + 1);
  }
  return failed;
}

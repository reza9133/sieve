import {
  MAX_BIDS_LIMIT,
  MAX_ID,
  MAX_REQUIREMENTS,
  MAX_REVEAL_WINDOW_SECONDS,
  MAX_COMMIT_HORIZON_SECONDS,
  MAX_SUMMARY,
  MAX_TITLE,
  MAX_URL,
  MIN_BOND_WEI,
  MIN_BUDGET_WEI,
  MIN_WINDOW_SECONDS,
} from './constants';

/** Every validator returns an error message, or null when the value is acceptable. */
export type Check = string | null;

const codePoints = (text: string) => [...text].length;

/** Python `str.split()`/join: collapse all whitespace runs, as the contract's `_clean` does. */
export function cleanText(value: string): string {
  return value.replace(/\0/g, ' ').split(/\s+/).filter(Boolean).join(' ');
}

export function validateTenderId(value: string): Check {
  const id = value.trim();
  if (id.length > MAX_ID || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(id))
    return 'Use 1-64 characters: letters, digits, "_", "." or "-", starting with a letter or digit.';
  return null;
}

export function validateTitle(value: string): Check {
  const text = cleanText(value);
  if (!text) return 'Enter a title.';
  if (codePoints(text) > MAX_TITLE) return `Keep the title within ${MAX_TITLE} characters.`;
  return null;
}

export function validateSummary(value: string): Check {
  const text = cleanText(value);
  if (!text) return 'Enter a summary.';
  if (codePoints(text) > MAX_SUMMARY) return `Keep the summary within ${MAX_SUMMARY} characters.`;
  return null;
}

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim()) && !/^0x0{40}$/.test(value.trim());
}

export function validateAddress(value: string): Check {
  return isAddress(value) ? null : 'Enter a 0x address with 40 hex characters.';
}

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeHash(value: string): string {
  return value.trim().toLowerCase();
}

export function validateHash(value: string): Check {
  return /^0x[0-9a-f]{64}$/.test(normalizeHash(value))
    ? null
    : 'Enter a SHA-256 as 0x followed by 64 hex characters.';
}

export function validateSalt(value: string): Check {
  return /^[A-Za-z0-9_.~-]{16,64}$/.test(value.trim())
    ? null
    : 'Use 16-64 characters from A-Z a-z 0-9 _ . ~ -';
}

export function validateRequirementCount(n: number): Check {
  return Number.isInteger(n) && n >= 1 && n <= MAX_REQUIREMENTS
    ? null
    : `Use a whole number from 1 to ${MAX_REQUIREMENTS}.`;
}

export function validateMaxBids(n: number): Check {
  return Number.isInteger(n) && n >= 1 && n <= MAX_BIDS_LIMIT
    ? null
    : `Use a whole number from 1 to ${MAX_BIDS_LIMIT}.`;
}

export function validateBudget(wei: bigint | null, min: bigint = MIN_BUDGET_WEI): Check {
  if (wei === null) return 'Enter an amount in GEN.';
  return wei >= min ? null : 'The budget is below the contract minimum.';
}

export function validateBond(
  bond: bigint | null,
  budget: bigint | null,
  min: bigint = MIN_BOND_WEI,
): Check {
  if (bond === null) return 'Enter an amount in GEN.';
  if (bond < min) return 'The bond is below the contract minimum.';
  if (budget !== null && bond > budget) return 'The bond cannot exceed the budget.';
  return null;
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.test'];

/**
 * Mirrors `_host()` in contracts/sieve.py. Deliberate differences, both stricter:
 * any '#' is rejected (the contract only rejects a non-empty fragment).
 */
export function validateHttpsUrl(value: string): Check {
  const text = value.trim();
  const invalid = 'Enter a valid HTTPS URL.';
  if (!text || codePoints(text) > MAX_URL) return `Enter an HTTPS URL of at most ${MAX_URL} characters.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f]/.test(text)) return 'The URL must not contain spaces or control characters.';
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/s.exec(text);
  if (!match || match[1]?.toLowerCase() !== 'https') return 'The URL must start with https://';
  const rest = match[2] ?? '';
  if (!rest.startsWith('//')) return invalid;
  if (text.includes('#')) return 'The URL must not contain a fragment (#).';
  const afterSlashes = rest.slice(2);
  const end = afterSlashes.search(/[/?#]/);
  const netloc = end === -1 ? afterSlashes : afterSlashes.slice(0, end);
  if (netloc.includes('@')) return 'The URL must not contain a username or password.';
  if (netloc.startsWith('[')) return 'IP addresses are not allowed. Use a domain name.';
  const colon = netloc.lastIndexOf(':');
  const hostPart = colon === -1 ? netloc : netloc.slice(0, colon);
  const portPart = colon === -1 ? '' : netloc.slice(colon + 1);
  if (portPart !== '') {
    if (!/^\d+$/.test(portPart) || Number(portPart) > 65535) return invalid;
    if (Number(portPart) !== 443) return 'Only the default HTTPS port (443) is allowed.';
  }
  const hostname = hostPart.toLowerCase().replace(/\.+$/, '');
  if (!hostname) return invalid;
  if (hostname === 'localhost' || LOCAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix)))
    return 'Local and internal hosts are not allowed.';
  const labels = hostname.split('.');
  const tld = labels[labels.length - 1] ?? '';
  if (/^\d+$/.test(tld) && labels.length === 4) return 'IP addresses are not allowed. Use a domain name.';
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    !/^[a-z]{2,63}$/.test(tld) ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    return 'The host name is not a valid public domain.';
  return null;
}

export interface Deadlines {
  commitBy: bigint;
  revealBy: bigint;
}

/** Contract rules from `open_tender`. All values are unix seconds. */
export function validateDeadlines(
  now: bigint,
  { commitBy, revealBy }: Deadlines,
  minWindow: bigint = MIN_WINDOW_SECONDS,
): Check {
  if (commitBy < now + minWindow) return 'Bidding must close at least 2 minutes from now.';
  if (commitBy > now + MAX_COMMIT_HORIZON_SECONDS) return 'Bidding can close at most 30 days from now.';
  if (revealBy < commitBy + minWindow) return 'The reveal window must be at least 2 minutes long.';
  if (revealBy > commitBy + MAX_REVEAL_WINDOW_SECONDS) return 'The reveal window can be at most 7 days.';
  return null;
}

export function deadlinesFromDurations(
  now: bigint,
  biddingSeconds: bigint,
  revealSeconds: bigint,
): Deadlines {
  const commitBy = now + biddingSeconds;
  return { commitBy, revealBy: commitBy + revealSeconds };
}

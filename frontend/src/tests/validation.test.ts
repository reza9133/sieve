import { describe, expect, it } from 'vitest';
import {
  cleanText,
  deadlinesFromDurations,
  validateAddress,
  validateBond,
  validateBudget,
  validateDeadlines,
  validateHash,
  validateHttpsUrl,
  validateMaxBids,
  validateRequirementCount,
  validateSalt,
  validateSummary,
  validateTenderId,
  validateTitle,
} from '@/lib/validation';

describe('https URL validation (mirrors _host in the contract)', () => {
  const good = [
    'https://example.com/proposal.md',
    'https://EXAMPLE.com/x?y=1',
    'https://example.com:443/x',
    'https://example.com./x',
    'https://raw.githubusercontent.com/reza9133/sieve/abc/fixtures/live/alpha.md',
    'https://a-b.example.co.uk',
  ];
  const bad: Array<[string, RegExp?]> = [
    ['http://example.com/x', /https/],
    ['ftp://example.com/x'],
    ['https://example.com:8443/x', /443/],
    ['https://user@example.com/x', /username/],
    ['https://user:pw@example.com/x', /username/],
    ['https://@example.com/x', /username/],
    ['https://example.com/x#frag', /fragment/],
    ['https://localhost/x', /Local/],
    ['https://app.localhost/x', /Local/],
    ['https://printer.local/x', /Local/],
    ['https://svc.internal/x', /Local/],
    ['https://site.test/x', /Local/],
    ['https://127.0.0.1/x', /IP/],
    ['https://[::1]/x', /IP/],
    ['https://example/x'],
    ['https://example.c0m/x'],
    ['https://-bad.example.com/x'],
    ['https://exa mple.com/x', /spaces/],
    ['https://example.com/\u0000', /control/],
    ['https:///path'],
    [''],
    [`https://example.com/${'a'.repeat(600)}`],
  ];
  it.each(good)('accepts %s', (url) => expect(validateHttpsUrl(url)).toBeNull());
  it.each(bad)('rejects %s', (url, pattern) => {
    const result = validateHttpsUrl(url);
    expect(result).not.toBeNull();
    if (pattern) expect(result).toMatch(pattern);
  });
});

describe('field validation', () => {
  it('tender id', () => {
    expect(validateTenderId('tender-001')).toBeNull();
    expect(validateTenderId('a')).toBeNull();
    expect(validateTenderId('a'.repeat(64))).toBeNull();
    expect(validateTenderId('a'.repeat(65))).not.toBeNull();
    expect(validateTenderId('-lead')).not.toBeNull();
    expect(validateTenderId('has space')).not.toBeNull();
    expect(validateTenderId('')).not.toBeNull();
  });
  it('title and summary use the contract cleaning rules', () => {
    expect(cleanText('  a \n\t b  ')).toBe('a b');
    expect(validateTitle('   ')).not.toBeNull();
    expect(validateTitle('x'.repeat(120))).toBeNull();
    expect(validateTitle('x'.repeat(121))).not.toBeNull();
    expect(validateSummary('x'.repeat(600))).toBeNull();
    expect(validateSummary('x'.repeat(601))).not.toBeNull();
  });
  it('hash must be lowercase-normalisable 0x + 64 hex', () => {
    const h = '0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19';
    expect(validateHash(h)).toBeNull();
    expect(validateHash(h.toUpperCase().replace('0X', '0x'))).toBeNull();
    expect(validateHash(h.slice(0, -1))).not.toBeNull();
    expect(validateHash('94a8')).not.toBeNull();
  });
  it('salt', () => {
    expect(validateSalt('abcdefghijklmnop')).toBeNull();
    expect(validateSalt('short')).not.toBeNull();
    expect(validateSalt('a'.repeat(65))).not.toBeNull();
    expect(validateSalt('abcdefghijklmnop!')).not.toBeNull();
  });
  it('address', () => {
    expect(validateAddress('0xAbCdEf0123456789aBcDeF0123456789abcdef01')).toBeNull();
    expect(validateAddress('0x' + '0'.repeat(40))).not.toBeNull();
    expect(validateAddress('0x123')).not.toBeNull();
  });
  it('counts and economics', () => {
    expect(validateRequirementCount(1)).toBeNull();
    expect(validateRequirementCount(8)).toBeNull();
    expect(validateRequirementCount(0)).not.toBeNull();
    expect(validateRequirementCount(9)).not.toBeNull();
    expect(validateMaxBids(16)).toBeNull();
    expect(validateMaxBids(17)).not.toBeNull();
    expect(validateBudget(10n ** 15n)).toBeNull();
    expect(validateBudget(10n ** 15n - 1n)).not.toBeNull();
    expect(validateBond(10n ** 14n, 10n ** 15n)).toBeNull();
    expect(validateBond(10n ** 14n - 1n, 10n ** 15n)).not.toBeNull();
    expect(validateBond(10n ** 15n, 10n ** 15n)).toBeNull();
    expect(validateBond(10n ** 15n + 1n, 10n ** 15n)).not.toBeNull();
  });
});

describe('deadline validation', () => {
  const now = 1_800_000_000n;
  const day = 86400n;
  it('commit_by edges', () => {
    expect(validateDeadlines(now, { commitBy: now + 120n, revealBy: now + 240n })).toBeNull();
    expect(validateDeadlines(now, { commitBy: now + 119n, revealBy: now + 240n })).not.toBeNull();
    expect(validateDeadlines(now, { commitBy: now + 30n * day, revealBy: now + 30n * day + 120n })).toBeNull();
    expect(validateDeadlines(now, { commitBy: now + 30n * day + 1n, revealBy: now + 31n * day })).not.toBeNull();
  });
  it('reveal_by edges', () => {
    const commitBy = now + 1000n;
    expect(validateDeadlines(now, { commitBy, revealBy: commitBy + 120n })).toBeNull();
    expect(validateDeadlines(now, { commitBy, revealBy: commitBy + 119n })).not.toBeNull();
    expect(validateDeadlines(now, { commitBy, revealBy: commitBy + 7n * day })).toBeNull();
    expect(validateDeadlines(now, { commitBy, revealBy: commitBy + 7n * day + 1n })).not.toBeNull();
  });
  it('derives deadlines from durations', () => {
    expect(deadlinesFromDurations(now, 600n, 300n)).toEqual({ commitBy: now + 600n, revealBy: now + 900n });
  });
});

import { describe, expect, it } from 'vitest';
import { canCancel, canCommit, canFinalize, canReveal, canReview, canWithdrawBid, isExhausted } from '@/lib/permissions';
import type { Bid, Tender } from '@/chain/types';

const FUNDER = '0x1111111111111111111111111111111111111111';
const ALICE = '0x2222222222222222222222222222222222222222';
const BOB = '0x3333333333333333333333333333333333333333';

const tender = (over: Partial<Tender> = {}): Tender => ({
  tender_id: 't1', funder: FUNDER, title: 't', summary: 's', requirements_url: 'https://example.com/r.md',
  requirements_hash: '0x' + '0'.repeat(64), requirement_count: 3, budget_wei: 10n ** 16n, bond_wei: 10n ** 15n,
  max_bids: 3, bid_count: 0, created_at: 0n, commit_by: 1000n, reveal_by: 2000n, review_by: 2000n + 259200n,
  status: 'open', settlement: '', winner: '', award_price: 0n, forfeited_wei: 0n, refunded_wei: 0n, ...over,
});
const bid = (over: Partial<Bid> = {}): Bid => ({
  bidder: ALICE, index: 0, commitment: '0x' + '1'.repeat(64), status: 'committed', outcome: '', price: 0n,
  proposal_url: '', proposal_hash: '', committed_at: 0n, revealed_at: 0n, bond_wei: 10n ** 15n, review_calls: 0,
  attempts: 0, retry_at: 0n, confidence: 0, failed_mask: 0, instruction_attempt: '', rationale: '', reason: '', ...over,
});
const as = (account: string | null, chainReady = true) => ({ account, chainReady });

describe('write gate', () => {
  it('blocks everything without a wallet or on the wrong chain, with a reason', () => {
    expect(canCommit(0n, tender(), [], as(null))).toMatchObject({ enabled: false, reason: expect.stringContaining('Connect') });
    expect(canCommit(0n, tender(), [], as(ALICE, false))).toMatchObject({ enabled: false, reason: expect.stringContaining('Studionet') });
  });
});

describe('commit / withdraw', () => {
  it('commit allowed strictly before commit_by', () => {
    expect(canCommit(999n, tender(), [], as(ALICE)).enabled).toBe(true);
    expect(canCommit(1000n, tender(), [], as(ALICE)).enabled).toBe(false);
  });
  it('funder cannot bid, one bid each, capacity', () => {
    expect(canCommit(0n, tender(), [], as(FUNDER)).reason).toMatch(/own tender/);
    expect(canCommit(0n, tender({ bid_count: 1 }), [bid()], as(ALICE)).reason).toMatch(/already/);
    expect(canCommit(0n, tender({ bid_count: 3 }), [], as(BOB)).reason).toMatch(/full/);
  });
  it('withdraw only while sealed and before commit_by', () => {
    expect(canWithdrawBid(999n, tender(), bid(), as(ALICE)).enabled).toBe(true);
    expect(canWithdrawBid(1000n, tender(), bid(), as(ALICE)).enabled).toBe(false);
    expect(canWithdrawBid(0n, tender(), bid({ status: 'revealed' }), as(ALICE)).enabled).toBe(false);
  });
});

describe('reveal window', () => {
  it('commit_by <= now < reveal_by', () => {
    expect(canReveal(999n, tender(), bid(), as(ALICE)).enabled).toBe(false);
    expect(canReveal(1000n, tender(), bid(), as(ALICE)).enabled).toBe(true);
    expect(canReveal(1999n, tender(), bid(), as(ALICE)).enabled).toBe(true);
    expect(canReveal(2000n, tender(), bid(), as(ALICE)).enabled).toBe(false);
  });
});

describe('review', () => {
  const revealed = bid({ status: 'revealed' });
  it('window reveal_by <= now < review_by', () => {
    expect(canReview(1999n, tender(), revealed, as(FUNDER)).enabled).toBe(false);
    expect(canReview(2000n, tender(), revealed, as(FUNDER)).enabled).toBe(true);
    expect(canReview(2000n + 259200n, tender(), revealed, as(FUNDER)).enabled).toBe(false);
  });
  it('only the funder or the bid owner', () => {
    expect(canReview(2000n, tender(), revealed, as(ALICE)).enabled).toBe(true);
    expect(canReview(2000n, tender(), revealed, as(BOB)).reason).toMatch(/Only the funder/);
  });
  it('cooldown and exhausted budget explain themselves', () => {
    expect(canReview(2000n, tender(), bid({ status: 'revealed', retry_at: 2100n }), as(FUNDER)).reason).toMatch(/cooldown/i);
    expect(canReview(2000n, tender(), bid({ status: 'revealed', review_calls: 8 }), as(FUNDER)).reason).toMatch(/used up/);
    expect(isExhausted(bid({ attempts: 3 }))).toBe(true);
    expect(isExhausted(bid({ review_calls: 7, attempts: 2 }))).toBe(false);
  });
});

describe('finalize', () => {
  it('not before reveal_by', () => {
    expect(canFinalize(1999n, tender(), []).enabled).toBe(false);
    expect(canFinalize(2000n, tender(), []).enabled).toBe(true);
  });
  it('blocked by a bid still open for screening until review_by', () => {
    const open = [bid({ status: 'revealed' })];
    expect(canFinalize(2000n, tender(), open).enabled).toBe(false);
    expect(canFinalize(2000n + 259200n - 1n, tender(), open).enabled).toBe(false);
    expect(canFinalize(2000n + 259200n, tender(), open).enabled).toBe(true);
  });
  it('unrevealed, decided and exhausted bids do not block', () => {
    expect(canFinalize(2000n, tender(), [bid(), bid({ status: 'compliant' }), bid({ status: 'revealed', attempts: 3 })]).enabled).toBe(true);
  });
  it('not twice', () => {
    expect(canFinalize(5000n, tender({ status: 'finalized' }), []).enabled).toBe(false);
  });
});

describe('cancel', () => {
  it('funder only, open, zero bids ever sealed', () => {
    expect(canCancel(0n, tender(), as(FUNDER)).enabled).toBe(true);
    expect(canCancel(0n, tender(), as(ALICE)).enabled).toBe(false);
    expect(canCancel(0n, tender({ bid_count: 1 }), as(FUNDER)).enabled).toBe(false);
    expect(canCancel(0n, tender({ status: 'cancelled' }), as(FUNDER)).enabled).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { bidSchema, tenderSchema, toBigInt, accountingSchema, rankingSchema, parseResponse } from '@/chain/types';
import { extractContractMessage, parseError } from '@/chain/errors';
import { interpretReceipt } from '@/chain/sieveClient';

describe('toBigInt', () => {
  it('normalises number, string and bigint', () => {
    expect(toBigInt(5)).toBe(5n);
    expect(toBigInt('1000000000000000000000')).toBe(10n ** 21n);
    expect(toBigInt(7n)).toBe(7n);
  });
  it('rejects unsafe, fractional and junk values', () => {
    expect(() => toBigInt(2 ** 60)).toThrow();
    expect(() => toBigInt(1.5)).toThrow();
    expect(() => toBigInt('12abc')).toThrow();
    expect(() => toBigInt(null)).toThrow();
    expect(() => toBigInt(Number.NaN)).toThrow();
  });
});

const tenderRaw = {
  tender_id: 't', funder: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01', title: 'T', summary: 'S',
  requirements_url: 'https://example.com/r.md', requirements_hash: '0x' + 'a'.repeat(64), requirement_count: 3,
  budget_wei: 3000000000000000, bond_wei: '300000000000000', max_bids: 6, bid_count: 6, created_at: 1, commit_by: 2,
  reveal_by: 3, review_by: 4, status: 'open', settlement: '', winner: '', award_price: 0, forfeited_wei: 0, refunded_wei: 0,
};

describe('response schemas', () => {
  it('parses get_tender with mixed numeric encodings and lowercases the funder', () => {
    const t = parseResponse(tenderSchema, 'get_tender', tenderRaw);
    expect(t.budget_wei).toBe(3000000000000000n);
    expect(t.bond_wei).toBe(300000000000000n);
    expect(t.funder).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
    expect(t.max_bids).toBe(6);
  });
  it('names the call and field on a bad response', () => {
    expect(() => parseResponse(tenderSchema, 'get_tender', { ...tenderRaw, status: 'weird' })).toThrow(/get_tender.*status/);
    expect(() => parseResponse(tenderSchema, 'get_tender', { ...tenderRaw, budget_wei: 'x' })).toThrow(/budget_wei/);
  });
  it('parses get_bid, get_accounting and get_ranking', () => {
    const bid = parseResponse(bidSchema, 'get_bid', {
      bidder: '0xAA', index: 0, commitment: '0x1', status: 'noncompliant', outcome: '', price: '800000000000000',
      proposal_url: 'u', proposal_hash: 'h', committed_at: 1, revealed_at: 2, bond_wei: 3, review_calls: 1, attempts: 1,
      retry_at: 0, confidence: 98, failed_mask: 4, instruction_attempt: 'no', rationale: 'r', reason: '',
    });
    expect(bid.failed_mask).toBe(4);
    expect(bid.price).toBe(800000000000000n);
    expect(parseResponse(accountingSchema, 'a', {
      total_credits: 1, total_locked_budgets: '2', total_locked_bonds: 3, accounted_liabilities: 6,
      contract_balance: 6, unallocated_balance: 0, balance_shortfall: 0, solvent: true,
    }).solvent).toBe(true);
    expect(parseResponse(rankingSchema, 'r', { entries: [{ bidder: '0xAB', price: '5', index: 1 }] }).entries[0]?.price).toBe(5n);
  });
});

describe('errors', () => {
  it('extracts the human part of an [EXPECTED] message anywhere in a value', () => {
    expect(extractContractMessage('GenVMError: [EXPECTED] Bidding is closed')).toBe('Bidding is closed');
    expect(extractContractMessage({ a: [{ error: 'x [EXPECTED] Tender is full' }] })).toBe('Tender is full');
    expect(extractContractMessage('nothing here')).toBeNull();
  });
  it('maps wallet rejection (4001) to a friendly message', () => {
    const e = parseError(Object.assign(new Error('User rejected'), { code: 4001 }));
    expect(e.kind).toBe('wallet-rejected');
    expect(e.message).toMatch(/rejected/);
  });
  it('keeps the raw text in details', () => {
    const e = parseError(new Error('boom [EXPECTED] Reveal window is not open'));
    expect(e.kind).toBe('contract');
    expect(e.message).toBe('Reveal window is not open');
    expect(e.details).toContain('boom');
  });
});

describe('receipt interpretation', () => {
  it('treats FINISHED_WITH_RETURN as success', () => {
    expect(interpretReceipt('0xh', { txExecutionResultName: 'FINISHED_WITH_RETURN' }).ok).toBe(true);
  });
  it('finds the contract error inside a failed receipt', () => {
    const out = interpretReceipt('0xh', {
      txExecutionResultName: 'FINISHED_WITH_ERROR',
      consensus_data: { leader_receipt: [{ error: 'UserError: [EXPECTED] Insufficient available credit' }] },
    });
    expect(out.ok).toBe(false);
    expect(out.error?.message).toBe('Insufficient available credit');
  });
  it('is not a success when the result is missing', () => {
    expect(interpretReceipt('0xh', { statusName: 'PENDING' }).ok).toBe(false);
  });
});

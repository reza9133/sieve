import { z } from 'zod';

/**
 * genlayer-js returns integers as `number` (when safe), `string` (when large) or `bigint`.
 * Every numeric field goes through this normaliser. Anything that is not a clean integer throws.
 */
export function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`Unsafe or non-integer number: ${String(value)}`);
    return BigInt(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  throw new Error(`Cannot read integer from ${typeof value}`);
}

const big = z.unknown().transform((v, ctx) => {
  try {
    return toBigInt(v);
  } catch (e) {
    ctx.addIssue({ code: 'custom', message: e instanceof Error ? e.message : 'bad integer' });
    return z.NEVER;
  }
});
/** Small counters (u16) land in `number` after being normalised through toBigInt. */
const small = big.transform((v, ctx) => {
  if (v < 0n || v > 0xffffn) {
    ctx.addIssue({ code: 'custom', message: 'u16 out of range' });
    return z.NEVER;
  }
  return Number(v);
});
const lowerHex = z.string().transform((s) => s.toLowerCase());
const addrOrEmpty = z.string().transform((s) => s.toLowerCase());

export const TENDER_STATUSES = ['open', 'finalized', 'cancelled'] as const;
export const BID_STATUSES = [
  'committed',
  'revealed',
  'compliant',
  'noncompliant',
  'disqualified',
  'withdrawn',
] as const;
export const BID_OUTCOMES = [
  'won',
  'compliant_not_lowest',
  'noncompliant_bond_refunded',
  'unscreened_bond_refunded',
  'disqualified_bond_forfeited',
  'unrevealed_bond_forfeited',
  'withdrawn_bond_refunded',
] as const;

export const tenderSchema = z.object({
  tender_id: z.string(),
  funder: lowerHex,
  title: z.string(),
  summary: z.string(),
  requirements_url: z.string(),
  requirements_hash: z.string(),
  requirement_count: small,
  budget_wei: big,
  bond_wei: big,
  max_bids: small,
  bid_count: small,
  created_at: big,
  commit_by: big,
  reveal_by: big,
  review_by: big,
  status: z.enum(TENDER_STATUSES),
  settlement: z.string(),
  winner: addrOrEmpty,
  award_price: big,
  forfeited_wei: big,
  refunded_wei: big,
});
export type Tender = z.infer<typeof tenderSchema>;

export const bidSchema = z.object({
  bidder: lowerHex,
  index: small,
  commitment: z.string(),
  status: z.enum(BID_STATUSES),
  outcome: z.union([z.literal(''), z.enum(BID_OUTCOMES)]),
  price: big,
  proposal_url: z.string(),
  proposal_hash: z.string(),
  committed_at: big,
  revealed_at: big,
  bond_wei: big,
  review_calls: small,
  attempts: small,
  retry_at: big,
  confidence: small,
  failed_mask: small,
  instruction_attempt: z.union([z.literal(''), z.enum(['yes', 'no', 'unclear'])]),
  rationale: z.string(),
  reason: z.string(),
});
export type Bid = z.infer<typeof bidSchema>;

export const accountingSchema = z.object({
  total_credits: big,
  total_locked_budgets: big,
  total_locked_bonds: big,
  accounted_liabilities: big,
  contract_balance: big,
  unallocated_balance: big,
  balance_shortfall: big,
  solvent: z.boolean(),
});
export type Accounting = z.infer<typeof accountingSchema>;

export const infoSchema = z.object({
  name: z.string(),
  version: z.string(),
  min_budget_wei: big,
  min_bond_wei: big,
  max_requirements: small,
  max_bids_limit: small,
  minimum_confidence: small,
  min_window_seconds: big,
  review_window_seconds: big,
  max_review_calls_per_bid: small,
  max_semantic_assessments_per_bid: small,
  retry_cooldown_seconds: small,
  max_retry_cooldown_seconds: small,
  commitment_scheme: z.string(),
  ranking_rule: z.string(),
  settlement_model: z.string(),
  forfeiture_policy: z.string(),
  decisive_verdict_policy: z.string(),
});
export type Info = z.infer<typeof infoSchema>;

export const biddersSchema = z.object({ bidders: z.array(z.string().transform((s) => s.toLowerCase())) });

export const rankingSchema = z.object({
  entries: z.array(z.object({ bidder: lowerHex, price: big, index: small })),
});
export type RankingEntry = z.infer<typeof rankingSchema>['entries'][number];

/** The shape genlayer-js hands back is an object-ish JSON tree; parse errors name the contract call. */
export function parseResponse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, label: string, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(
      `Unexpected response from ${label}: ${first ? `${first.path.join('.')} ${first.message}` : 'invalid'}`,
    );
  }
  return result.data;
}

export const TENDER_STATUS_LABEL: Record<Tender['status'], string> = {
  open: 'Open',
  finalized: 'Finalized',
  cancelled: 'Cancelled',
};

export const BID_STATUS_LABEL: Record<Bid['status'], string> = {
  committed: 'Sealed',
  revealed: 'Revealed',
  compliant: 'Compliant',
  noncompliant: 'Noncompliant',
  disqualified: 'Disqualified',
  withdrawn: 'Withdrawn',
};

export const BID_OUTCOME_LABEL: Record<(typeof BID_OUTCOMES)[number], string> = {
  won: 'Won the tender',
  compliant_not_lowest: 'Compliant, not the lowest price',
  noncompliant_bond_refunded: 'Noncompliant, bond refunded',
  unscreened_bond_refunded: 'Never screened, bond refunded',
  disqualified_bond_forfeited: 'Disqualified, bond forfeited to the funder',
  unrevealed_bond_forfeited: 'Never revealed, bond forfeited to the funder',
  withdrawn_bond_refunded: 'Withdrawn, bond refunded',
};

export const SETTLEMENT_LABEL: Record<string, string> = {
  awarded_to_lowest_compliant_bid: 'Awarded to the lowest compliant bid',
  no_compliant_bid_budget_returned: 'No compliant bid; the whole budget returned to the funder',
  cancelled_before_any_bid: 'Cancelled before any bid was sealed',
};

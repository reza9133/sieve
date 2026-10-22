/**
 * Exact return shapes and parameter types for the Sieve intelligent contract.
 * All financial amounts and unix timestamps are BigInt.
 */

export type TenderStatus = 'open' | 'finalized' | 'cancelled'

export type BidStatus =
  | 'committed'
  | 'revealed'
  | 'compliant'
  | 'noncompliant'
  | 'disqualified'
  | 'withdrawn'

export type BidOutcome =
  | 'won'
  | 'compliant_not_lowest'
  | 'noncompliant_bond_refunded'
  | 'unscreened_bond_refunded'
  | 'disqualified_bond_forfeited'
  | 'unrevealed_bond_forfeited'
  | 'withdrawn_bond_refunded'
  | ''

export interface TenderData {
  tenderId: string
  funder: string
  title: string
  summary: string
  requirementsUrl: string
  requirementsHash: string
  requirementCount: number
  budgetWei: bigint
  bondWei: bigint
  maxBids: number
  bidCount: number
  createdAt: bigint
  commitBy: bigint
  revealBy: bigint
  reviewBy: bigint
  status: TenderStatus
  settlement: string
  winner: string
  awardPrice: bigint
  forfeitedWei: bigint
  refundedWei: bigint
}

export interface BidData {
  bidder: string
  index: number
  commitment: string
  status: BidStatus
  outcome: BidOutcome
  price: bigint // 0 until revealed
  proposalUrl: string
  proposalHash: string
  committedAt: bigint
  revealedAt: bigint
  bondWei: bigint
  reviewCalls: number
  attempts: number
  retryAt: bigint
  confidence: number
  failedMask: number
  instructionAttempt: string
  rationale: string
  reason: string
}

export interface AccountingData {
  totalCredits: bigint
  totalLockedBudgets: bigint
  totalLockedBonds: bigint
  accountedLiabilities: bigint
  contractBalance: bigint
  unallocatedBalance: bigint
  balanceShortfall: bigint
  solvent: boolean
}

export interface ContractInfoData {
  name: string
  version: string
  minBudgetWei: bigint
  minBondWei: bigint
  maxRequirements: number
  maxBidsLimit: number
  minimumConfidence: number
  minWindowSeconds: number
  reviewWindowSeconds: number
  maxReviewCallsPerBid: number
  maxSemanticAssessmentsPerBid: number
  retryCooldownSeconds: number
  maxRetryCooldownSeconds: number
  commitmentScheme: string
  rankingRule: string
  settlementModel: string
  forfeiturePolicy: string
  decisiveVerdictPolicy: string
}

export interface RankingEntry {
  bidder: string
  price: bigint
  index: number
}

export interface RankingData {
  entries: RankingEntry[]
}

export interface BiddersData {
  bidders: string[]
}

/**
 * Sieve Contract Client
 * Thin typed wrapper around GenLayer contract calls.
 * No UI component interacts directly with the RPC or low-level library.
 */

import { toBigInt } from '@/lib/units'
import {
  SIEVE_ADDRESS,
  RPC_URL,
} from './config'
import type {
  TenderData,
  BidData,
  AccountingData,
  ContractInfoData,
  RankingData,
  BiddersData,
} from './types'

// ------------------------ genlayer-js client ------------------------

type GenLayerModule = typeof import('genlayer-js')
type GenLayerClient = ReturnType<GenLayerModule['createClient']>
type CalldataArg = Parameters<GenLayerClient['readContract']>[0]['args']
type Address = `0x${string}`

const CONTRACT_ADDRESS = SIEVE_ADDRESS as Address

/**
 * Studionet chain definition used by genlayer-js.
 * genlayer-js ships a `studionet` chain (consensus contract addresses etc.); we copy it
 * because createClient() mutates `rpcUrls` when an endpoint is passed, and we must not
 * alter the shared object. The RPC endpoint stays configurable through VITE_RPC_URL.
 */
async function loadStudionet() {
  const genlayer = await import('genlayer-js')
  const chain = {
    ...genlayer.chains.studionet,
    rpcUrls: { default: { http: [RPC_URL] } },
  }
  return { genlayer, chain }
}

// One shared read-only client: reads need no wallet and no signing.
let readClientPromise: Promise<GenLayerClient> | null = null

function getReadClient(): Promise<GenLayerClient> {
  if (!readClientPromise) {
    readClientPromise = loadStudionet()
      .then(({ genlayer, chain }) => genlayer.createClient({ chain, endpoint: RPC_URL }))
      .catch((err) => {
        readClientPromise = null // allow a retry on the next call
        throw err
      })
  }
  return readClientPromise
}

/**
 * Call a view function on the Sieve contract through genlayer-js (gen_call).
 * Errors are surfaced to the caller instead of being masked by a different code path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callContractView(functionName: string, args: unknown[]): Promise<any> {
  const client = await getReadClient()
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as CalldataArg,
  })
}

// ------------------------ View Normalizers ------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTender(raw: any): TenderData {
  if (!raw) throw new Error('Tender not found')
  return {
    tenderId: String(raw.tender_id ?? raw.tenderId ?? ''),
    funder: String(raw.funder ?? ''),
    title: String(raw.title ?? ''),
    summary: String(raw.summary ?? ''),
    requirementsUrl: String(raw.requirements_url ?? raw.requirementsUrl ?? ''),
    requirementsHash: String(raw.requirements_hash ?? raw.requirementsHash ?? ''),
    requirementCount: Number(raw.requirement_count ?? raw.requirementCount ?? 0),
    budgetWei: toBigInt(raw.budget_wei ?? raw.budgetWei ?? 0),
    bondWei: toBigInt(raw.bond_wei ?? raw.bondWei ?? 0),
    maxBids: Number(raw.max_bids ?? raw.maxBids ?? 0),
    bidCount: Number(raw.bid_count ?? raw.bidCount ?? 0),
    createdAt: toBigInt(raw.created_at ?? raw.createdAt ?? 0),
    commitBy: toBigInt(raw.commit_by ?? raw.commitBy ?? 0),
    revealBy: toBigInt(raw.reveal_by ?? raw.revealBy ?? 0),
    reviewBy: toBigInt(raw.review_by ?? raw.reviewBy ?? 0),
    status: String(raw.status ?? 'open') as TenderData['status'],
    settlement: String(raw.settlement ?? ''),
    winner: String(raw.winner ?? ''),
    awardPrice: toBigInt(raw.award_price ?? raw.awardPrice ?? 0),
    forfeitedWei: toBigInt(raw.forfeited_wei ?? raw.forfeitedWei ?? 0),
    refundedWei: toBigInt(raw.refunded_wei ?? raw.refundedWei ?? 0),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeBid(raw: any): BidData {
  if (!raw) throw new Error('Bid not found')
  return {
    bidder: String(raw.bidder ?? ''),
    index: Number(raw.index ?? 0),
    commitment: String(raw.commitment ?? ''),
    status: String(raw.status ?? 'committed') as BidData['status'],
    outcome: String(raw.outcome ?? '') as BidData['outcome'],
    price: toBigInt(raw.price ?? 0),
    proposalUrl: String(raw.proposal_url ?? raw.proposalUrl ?? ''),
    proposalHash: String(raw.proposal_hash ?? raw.proposalHash ?? ''),
    committedAt: toBigInt(raw.committed_at ?? raw.committedAt ?? 0),
    revealedAt: toBigInt(raw.revealed_at ?? raw.revealedAt ?? 0),
    bondWei: toBigInt(raw.bond_wei ?? raw.bondWei ?? 0),
    reviewCalls: Number(raw.review_calls ?? raw.reviewCalls ?? 0),
    attempts: Number(raw.attempts ?? 0),
    retryAt: toBigInt(raw.retry_at ?? raw.retryAt ?? 0),
    confidence: Number(raw.confidence ?? 0),
    failedMask: Number(raw.failed_mask ?? raw.failedMask ?? 0),
    instructionAttempt: String(raw.instruction_attempt ?? raw.instructionAttempt ?? ''),
    rationale: String(raw.rationale ?? ''),
    reason: String(raw.reason ?? ''),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAccounting(raw: any): AccountingData {
  return {
    totalCredits: toBigInt(raw?.total_credits ?? raw?.totalCredits ?? 0),
    totalLockedBudgets: toBigInt(raw?.total_locked_budgets ?? raw?.totalLockedBudgets ?? 0),
    totalLockedBonds: toBigInt(raw?.total_locked_bonds ?? raw?.totalLockedBonds ?? 0),
    accountedLiabilities: toBigInt(raw?.accounted_liabilities ?? raw?.accountedLiabilities ?? 0),
    contractBalance: toBigInt(raw?.contract_balance ?? raw?.contractBalance ?? 0),
    unallocatedBalance: toBigInt(raw?.unallocated_balance ?? raw?.unallocatedBalance ?? 0),
    balanceShortfall: toBigInt(raw?.balance_shortfall ?? raw?.balanceShortfall ?? 0),
    solvent: Boolean(raw?.solvent),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeInfo(raw: any): ContractInfoData {
  return {
    name: String(raw?.name ?? 'Sieve'),
    version: String(raw?.version ?? '0.1.0'),
    minBudgetWei: toBigInt(raw?.min_budget_wei ?? 1000000000000000n),
    minBondWei: toBigInt(raw?.min_bond_wei ?? 100000000000000n),
    maxRequirements: Number(raw?.max_requirements ?? 8),
    maxBidsLimit: Number(raw?.max_bids_limit ?? 16),
    minimumConfidence: Number(raw?.minimum_confidence ?? 80),
    minWindowSeconds: Number(raw?.min_window_seconds ?? 120),
    reviewWindowSeconds: Number(raw?.review_window_seconds ?? 259200),
    maxReviewCallsPerBid: Number(raw?.max_review_calls_per_bid ?? 8),
    maxSemanticAssessmentsPerBid: Number(raw?.max_semantic_assessments_per_bid ?? 3),
    retryCooldownSeconds: Number(raw?.retry_cooldown_seconds ?? 60),
    maxRetryCooldownSeconds: Number(raw?.max_retry_cooldown_seconds ?? 3600),
    commitmentScheme: String(raw?.commitment_scheme ?? ''),
    rankingRule: String(raw?.ranking_rule ?? ''),
    settlementModel: String(raw?.settlement_model ?? ''),
    forfeiturePolicy: String(raw?.forfeiture_policy ?? ''),
    decisiveVerdictPolicy: String(raw?.decisive_verdict_policy ?? ''),
  }
}

// ------------------------ Public View Methods ------------------------

export async function fetchContractInfo(): Promise<ContractInfoData> {
  const raw = await callContractView('get_info', [])
  return normalizeInfo(raw)
}

export async function fetchAccounting(): Promise<AccountingData> {
  const raw = await callContractView('get_accounting', [])
  return normalizeAccounting(raw)
}

export async function fetchAvailableCredit(ownerAddress: string): Promise<bigint> {
  const raw = await callContractView('get_available_credit', [ownerAddress.trim().toLowerCase()])
  return toBigInt(raw)
}

export async function fetchTender(funderAddress: string, tenderId: string): Promise<TenderData> {
  const raw = await callContractView('get_tender', [funderAddress.trim().toLowerCase(), tenderId.trim()])
  return normalizeTender(raw)
}

export async function fetchBidders(funderAddress: string, tenderId: string): Promise<BiddersData> {
  const raw = await callContractView('get_bidders', [funderAddress.trim().toLowerCase(), tenderId.trim()])
  const biddersList: string[] = Array.isArray(raw?.bidders) ? raw.bidders.map(String) : []
  return { bidders: biddersList }
}

export async function fetchBid(
  funderAddress: string,
  tenderId: string,
  bidderAddress: string
): Promise<BidData> {
  const raw = await callContractView('get_bid', [
    funderAddress.trim().toLowerCase(),
    tenderId.trim(),
    bidderAddress.trim().toLowerCase(),
  ])
  return normalizeBid(raw)
}

export async function fetchRanking(funderAddress: string, tenderId: string): Promise<RankingData> {
  const raw = await callContractView('get_ranking', [funderAddress.trim().toLowerCase(), tenderId.trim()])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = Array.isArray(raw?.entries) ? raw.entries.map((e: any) => ({
    bidder: String(e.bidder ?? ''),
    price: toBigInt(e.price ?? 0),
    index: Number(e.index ?? 0),
  })) : []
  return { entries }
}

// ------------------------ Write Methods ------------------------

/**
 * Send a state-changing call to the Sieve contract.
 *
 * genlayer-js builds the GenLayer calldata, wraps it in the consensus contract's
 * addTransaction call and asks the connected wallet to sign/send it. The wallet is the
 * EIP-6963 provider the user selected (passed explicitly, not window.ethereum).
 * Resolves with the transaction hash once the wallet has submitted the transaction.
 */
async function executeContractWrite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string,
  functionName: string,
  args: unknown[],
  valueWei = 0n
): Promise<string> {
  if (!provider) throw new Error('No wallet provider connected')
  if (!account) throw new Error('No active account')

  const { genlayer, chain } = await loadStudionet()
  const client = genlayer.createClient({
    chain,
    endpoint: RPC_URL,
    account: account as Address,
    provider,
  })

  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as CalldataArg,
    value: valueWei,
  })

  return typeof txHash === 'string' ? txHash : String(txHash?.hash ?? txHash)
}

export async function executeDepositCredit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string,
  amountWei: bigint
): Promise<string> {
  return executeContractWrite(provider, account, 'deposit_credit', [], amountWei)
}

export async function executeWithdrawCredit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string
): Promise<string> {
  return executeContractWrite(provider, account, 'withdraw_credit', [])
}

export async function executeOpenTender(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string,
  params: {
    tenderId: string
    titleText: string
    summaryText: string
    requirementsUrlText: string
    requirementsHashText: string
    requirementCount: number
    budgetWei: bigint
    bondWei: bigint
    maxBids: number
    commitBy: bigint
    revealBy: bigint
  }
): Promise<string> {
  return executeContractWrite(provider, account, 'open_tender', [
    params.tenderId.trim(),
    params.titleText.trim(),
    params.summaryText.trim(),
    params.requirementsUrlText.trim(),
    params.requirementsHashText.trim().toLowerCase(),
    params.requirementCount,
    params.budgetWei,
    params.bondWei,
    params.maxBids,
    params.commitBy,
    params.revealBy,
  ])
}

export async function executeCancelTender(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string,
  tenderId: string
): Promise<string> {
  return executeContractWrite(provider, account, 'cancel_tender', [tenderId.trim()])
}

export async function executeCommitBid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string,
  params: {
    funderText: string
    tenderId: string
    commitmentText: string
  }
): Promise<string> {
  return executeContractWrite(provider, account, 'commit_bid', [
    params.funderText.trim().toLowerCase(),
    params.tenderId.trim(),
    params.commitmentText.trim().toLowerCase(),
  ])
}

export async function executeWithdrawBid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string,
  params: { funderText: string; tenderId: string }
): Promise<string> {
  return executeContractWrite(provider, account, 'withdraw_bid', [
    params.funderText.trim().toLowerCase(),
    params.tenderId.trim(),
  ])
}

export async function executeRevealBid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string,
  params: {
    funderText: string
    tenderId: string
    priceWei: bigint
    proposalUrlText: string
    proposalHashText: string
    saltText: string
  }
): Promise<string> {
  return executeContractWrite(provider, account, 'reveal_bid', [
    params.funderText.trim().toLowerCase(),
    params.tenderId.trim(),
    params.priceWei,
    params.proposalUrlText.trim(),
    params.proposalHashText.trim().toLowerCase(),
    params.saltText.trim(),
  ])
}

export async function executeReviewBid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string,
  params: {
    funderText: string
    tenderId: string
    bidderText: string
  }
): Promise<string> {
  return executeContractWrite(provider, account, 'review_bid', [
    params.funderText.trim().toLowerCase(),
    params.tenderId.trim(),
    params.bidderText.trim().toLowerCase(),
  ])
}

export async function executeFinalizeTender(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  account: string,
  params: { funderText: string; tenderId: string }
): Promise<string> {
  return executeContractWrite(provider, account, 'finalize_tender', [
    params.funderText.trim().toLowerCase(),
    params.tenderId.trim(),
  ])
}

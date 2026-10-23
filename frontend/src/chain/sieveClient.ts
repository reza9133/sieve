import { createClient } from 'genlayer-js';
import { TransactionStatus, type TransactionHash } from 'genlayer-js/types';
import { CHAIN, SIEVE_ADDRESS } from './config';
import { collectStrings, extractContractMessage, parseError, type ParsedError } from './errors';
import { clearReadCache, gated } from './rpcGate';
import {
  accountingSchema,
  bidSchema,
  biddersSchema,
  infoSchema,
  parseResponse,
  rankingSchema,
  tenderSchema,
  toBigInt,
  type Accounting,
  type Bid,
  type Info,
  type RankingEntry,
  type Tender,
} from './types';
import { z } from 'zod';

type Hex = `0x${string}`;
const contract = SIEVE_ADDRESS as Hex;

/** Minimal EIP-1193 provider, as announced through EIP-6963. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

let readClient: ReturnType<typeof createClient> | null = null;
function reader() {
  readClient ??= createClient({ chain: CHAIN });
  return readClient;
}

async function read(functionName: string, args: string[], ttlMs: number): Promise<unknown> {
  return gated(`${functionName}|${JSON.stringify(args)}`, ttlMs, () =>
    reader().readContract({ address: contract, functionName, args }),
  );
}

const TTL = { info: 5 * 60_000, view: 4_000, accounting: 8_000 };

/* ------------------------------------------------------------------------- reads */

export async function getInfo(): Promise<Info> {
  return parseResponse(infoSchema, 'get_info', await read('get_info', [], TTL.info));
}

export async function getAccounting(): Promise<Accounting> {
  return parseResponse(accountingSchema, 'get_accounting', await read('get_accounting', [], TTL.accounting));
}

export async function getAvailableCredit(owner: string): Promise<bigint> {
  return toBigInt(await read('get_available_credit', [owner.toLowerCase()], TTL.view));
}

export async function getTender(funder: string, tenderId: string): Promise<Tender> {
  return parseResponse(tenderSchema, 'get_tender', await read('get_tender', [funder.toLowerCase(), tenderId], TTL.view));
}

export async function getBid(funder: string, tenderId: string, bidder: string): Promise<Bid | null> {
  try {
    const raw = await read('get_bid', [funder.toLowerCase(), tenderId, bidder.toLowerCase()], TTL.view);
    return parseResponse(bidSchema, 'get_bid', raw);
  } catch (error) {
    if (/Bid not found/i.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }
}

export async function getBidders(funder: string, tenderId: string): Promise<string[]> {
  const raw = await read('get_bidders', [funder.toLowerCase(), tenderId], TTL.view);
  return parseResponse(biddersSchema, 'get_bidders', raw).bidders;
}

export async function getRanking(funder: string, tenderId: string): Promise<RankingEntry[]> {
  const raw = await read('get_ranking', [funder.toLowerCase(), tenderId], TTL.view);
  return parseResponse(rankingSchema, 'get_ranking', raw).entries;
}

export interface TenderBundle {
  tender: Tender;
  bids: Bid[];
  ranking: RankingEntry[];
  fetchedAt: number;
}

/** One tender page worth of data: get_tender, get_bidders, get_bid per bidder (max 16), get_ranking. */
export async function loadTenderBundle(funder: string, tenderId: string): Promise<TenderBundle> {
  const tender = await getTender(funder, tenderId);
  const [bidders, ranking] = await Promise.all([getBidders(funder, tenderId), getRanking(funder, tenderId)]);
  // rpcGate limits concurrency; this just fans out the (bounded) per-bidder reads.
  const bids = (await Promise.all(bidders.slice(0, 16).map((b) => getBid(funder, tenderId, b)))).filter(
    (b): b is Bid => b !== null,
  );
  bids.sort((a, b) => a.index - b.index);
  return { tender, bids, ranking, fetchedAt: Date.now() };
}

/* ------------------------------------------------------------------------ writes */

export interface OpenTenderArgs {
  tenderId: string;
  title: string;
  summary: string;
  requirementsUrl: string;
  requirementsHash: string;
  requirementCount: number;
  budgetWei: bigint;
  bondWei: bigint;
  maxBids: number;
  commitBy: bigint;
  revealBy: bigint;
}

export interface TxProgress {
  stage: 'awaiting-wallet' | 'submitted' | 'finalizing' | 'done' | 'failed';
  hash?: string;
}

export interface TxOutcome {
  hash: string;
  ok: boolean;
  error?: ParsedError;
  /** True when the wait timed out; the transaction may still finalize. */
  timedOut?: boolean;
}

const lower = (v: string) => v.toLowerCase();

/**
 * A client whose account is the connected address and whose transactions are sent through the
 * wallet the user picked. genlayer-js routes eth_sendTransaction/eth_accounts through `provider`
 * and only falls back to window.ethereum when none is given; we always give one.
 */
export function createWriter(provider: Eip1193Provider, account: string) {
  const client = createClient({ chain: CHAIN, account: account as Hex, provider });

  async function send(
    functionName: string,
    args: Array<string | bigint | number>,
    value: bigint | undefined,
    onProgress?: (p: TxProgress) => void,
  ): Promise<TxOutcome> {
    onProgress?.({ stage: 'awaiting-wallet' });
    let hash: string;
    try {
      hash = (await client.writeContract({
        address: contract,
        functionName,
        args,
        value: value ?? 0n,
      })) as string;
    } catch (error) {
      onProgress?.({ stage: 'failed' });
      return { hash: '', ok: false, error: parseError(error) };
    }
    onProgress?.({ stage: 'submitted', hash });
    onProgress?.({ stage: 'finalizing', hash });
    clearReadCache();
    try {
      const receipt = await reader().waitForTransactionReceipt({
        hash: hash as TransactionHash,
        status: TransactionStatus.FINALIZED,
        interval: 4000,
        retries: 90,
      });
      const outcome = interpretReceipt(hash, receipt);
      onProgress?.({ stage: outcome.ok ? 'done' : 'failed', hash });
      clearReadCache();
      return outcome;
    } catch (error) {
      const parsed = parseError(error);
      onProgress?.({ stage: 'failed', hash });
      const timedOut = /retries|timed? ?out|not found/i.test(parsed.details);
      return {
        hash,
        ok: false,
        timedOut,
        error: timedOut
          ? {
              ...parsed,
              message: 'The transaction was submitted but has not finalized yet. Check the explorer, then refresh.',
            }
          : parsed,
      };
    }
  }

  return {
    address: lower(account),
    depositCredit: (valueWei: bigint, p?: (s: TxProgress) => void) => send('deposit_credit', [], valueWei, p),
    withdrawCredit: (p?: (s: TxProgress) => void) => send('withdraw_credit', [], undefined, p),
    openTender: (a: OpenTenderArgs, p?: (s: TxProgress) => void) =>
      send(
        'open_tender',
        [
          a.tenderId.trim(),
          a.title,
          a.summary,
          a.requirementsUrl.trim(),
          a.requirementsHash.trim().toLowerCase(),
          BigInt(a.requirementCount),
          a.budgetWei,
          a.bondWei,
          BigInt(a.maxBids),
          a.commitBy,
          a.revealBy,
        ],
        undefined,
        p,
      ),
    cancelTender: (tenderId: string, p?: (s: TxProgress) => void) => send('cancel_tender', [tenderId], undefined, p),
    commitBid: (funder: string, tenderId: string, commitment: string, p?: (s: TxProgress) => void) =>
      send('commit_bid', [lower(funder), tenderId, commitment], undefined, p),
    withdrawBid: (funder: string, tenderId: string, p?: (s: TxProgress) => void) =>
      send('withdraw_bid', [lower(funder), tenderId], undefined, p),
    revealBid: (
      funder: string,
      tenderId: string,
      priceWei: bigint,
      proposalUrl: string,
      proposalHash: string,
      salt: string,
      p?: (s: TxProgress) => void,
    ) => send('reveal_bid', [lower(funder), tenderId, priceWei, proposalUrl, proposalHash, salt], undefined, p),
    reviewBid: (funder: string, tenderId: string, bidder: string, p?: (s: TxProgress) => void) =>
      send('review_bid', [lower(funder), tenderId, lower(bidder)], undefined, p),
    finalizeTender: (funder: string, tenderId: string, p?: (s: TxProgress) => void) =>
      send('finalize_tender', [lower(funder), tenderId], undefined, p),
  };
}

export type Writer = ReturnType<typeof createWriter>;

/* ------------------------------------------------------------------ receipt reading */

const receiptShape = z
  .object({
    txExecutionResultName: z.string().optional(),
    statusName: z.string().optional(),
    status: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

/**
 * GenLayer can finalize a transaction whose contract execution failed, so the execution result,
 * not the consensus status, decides success. The `[EXPECTED] ...` message is searched for in the
 * whole receipt because its exact location (leader receipt error/result) is not guaranteed.
 */
export function interpretReceipt(hash: string, receipt: unknown): TxOutcome {
  const parsed = receiptShape.safeParse(receipt);
  const execution = parsed.success ? parsed.data.txExecutionResultName : undefined;
  const status = parsed.success ? (parsed.data.statusName ?? String(parsed.data.status ?? '')) : '';
  if (execution === 'FINISHED_WITH_RETURN') return { hash, ok: true };
  if (execution === 'FINISHED_WITH_ERROR') {
    const message = extractContractMessage(receipt);
    return {
      hash,
      ok: false,
      error: {
        kind: 'contract',
        message: message ?? 'The contract rejected this call. Open the details for the raw result.',
        details: collectStrings(receipt).filter((s) => s.length < 600).slice(0, 12).join('\n'),
      },
    };
  }
  if (status === 'CANCELED' || status === 'UNDETERMINED') {
    return {
      hash,
      ok: false,
      error: { kind: 'network', message: `The network ended this transaction as ${status.toLowerCase()}.`, details: status },
    };
  }
  return {
    hash,
    ok: false,
    error: {
      kind: 'unknown',
      message: 'The execution result is not available yet. Check the explorer, then refresh.',
      details: `execution=${String(execution)} status=${status}`,
    },
  };
}

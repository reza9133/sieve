import { MAX_REVIEW_CALLS, MAX_SEMANTIC_ASSESSMENTS } from './constants';
import { phaseAt, type Phase } from './time';
import type { Bid, Tender } from '@/chain/types';

export interface ActionState {
  enabled: boolean;
  /** Always set when `enabled` is false; explains why. */
  reason?: string;
}

const ok: ActionState = { enabled: true };
const no = (reason: string): ActionState => ({ enabled: false, reason });

export function isExhausted(
  bid: Pick<Bid, 'review_calls' | 'attempts'>,
  maxCalls = MAX_REVIEW_CALLS,
  maxAssessments = MAX_SEMANTIC_ASSESSMENTS,
): boolean {
  return bid.review_calls >= maxCalls || bid.attempts >= maxAssessments;
}

/** True when finalization is still blocked by a bid that screening could yet decide. */
export function hasBidOpenForScreening(bids: readonly Bid[]): boolean {
  return bids.some((bid) => bid.status === 'revealed' && !isExhausted(bid));
}

export function canFinalize(now: bigint, tender: Tender, bids: readonly Bid[]): ActionState {
  if (tender.status !== 'open') return no('This tender is already settled.');
  if (now < tender.reveal_by) return no('The reveal window has not closed yet.');
  if (now < tender.review_by && hasBidOpenForScreening(bids))
    return no('A revealed bid can still be screened. Finalization opens when every bid is screened or at the review deadline.');
  return ok;
}

export interface Actor {
  /** Lowercase connected address, or null when read-only. */
  account: string | null;
  /** True only when the wallet is connected and on the right chain. */
  chainReady: boolean;
}

function writeGate(actor: Actor): ActionState | null {
  if (!actor.account) return no('Connect a wallet to act.');
  if (!actor.chainReady) return no('Switch your wallet to Studionet first.');
  return null;
}

export function canCancel(now: bigint, tender: Tender, actor: Actor): ActionState {
  const gate = writeGate(actor);
  if (gate) return gate;
  if (actor.account !== tender.funder) return no('Only the funder can cancel.');
  if (tender.status !== 'open') return no('This tender is already settled.');
  if (tender.bid_count > 0) return no('A tender with a sealed bid cannot be cancelled, even if that bid was withdrawn.');
  void now;
  return ok;
}

export function canCommit(now: bigint, tender: Tender, bids: readonly Bid[], actor: Actor): ActionState {
  const gate = writeGate(actor);
  if (gate) return gate;
  if (tender.status !== 'open') return no('This tender is not open.');
  if (now >= tender.commit_by) return no('Bidding is closed.');
  if (actor.account === tender.funder) return no('A funder cannot bid on their own tender.');
  if (bids.some((b) => b.bidder === actor.account)) return no('You already committed a bid to this tender.');
  if (tender.bid_count >= tender.max_bids) return no('The tender is full.');
  return ok;
}

export function canWithdrawBid(now: bigint, tender: Tender, myBid: Bid | undefined, actor: Actor): ActionState {
  const gate = writeGate(actor);
  if (gate) return gate;
  if (!myBid) return no('You have no bid on this tender.');
  if (myBid.status !== 'committed') return no('Only a sealed, unrevealed bid can be withdrawn.');
  if (tender.status !== 'open' || now >= tender.commit_by) return no('Withdrawal is only possible before bidding closes.');
  return ok;
}

export function canReveal(now: bigint, tender: Tender, myBid: Bid | undefined, actor: Actor): ActionState {
  const gate = writeGate(actor);
  if (gate) return gate;
  if (!myBid) return no('You have no bid on this tender.');
  if (myBid.status !== 'committed') return no('Your bid is not waiting for a reveal.');
  if (tender.status !== 'open') return no('This tender is not open.');
  if (now < tender.commit_by) return no('The reveal window opens when bidding closes.');
  if (now >= tender.reveal_by) return no('The reveal window has closed. The bond is forfeited at finalization.');
  return ok;
}

export function canReview(now: bigint, tender: Tender, bid: Bid, actor: Actor): ActionState {
  const gate = writeGate(actor);
  if (gate) return gate;
  if (actor.account !== tender.funder && actor.account !== bid.bidder)
    return no('Only the funder or this bid’s bidder can request screening.');
  if (tender.status !== 'open') return no('This tender is already settled.');
  if (now < tender.reveal_by) return no('Screening opens when the reveal window closes.');
  if (now >= tender.review_by) return no('The screening window has ended.');
  if (bid.status !== 'revealed') return no('This bid is not awaiting screening.');
  if (isExhausted(bid)) return no('The screening budget for this bid is used up.');
  if (now < bid.retry_at) return no('A cooldown is active. See the retry time.');
  return ok;
}

export function phaseOf(now: bigint, tender: Tender): Phase {
  return phaseAt(now, tender);
}

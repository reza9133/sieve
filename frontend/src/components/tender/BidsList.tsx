import type { ReactNode } from 'react';
import type { Bid, Tender } from '@/chain/types';
import { Addr, HashText } from '@/components/ui/Addr';
import { Gen, UntrustedText } from '@/components/ui/Gen';
import { EmptyState } from '@/components/ui/Notice';
import { UntrustedUrl } from '@/components/ui/UntrustedUrl';
import { TxPanel } from '@/components/wallet/TxPanel';
import { canReview, type Actor } from '@/lib/permissions';
import { decodeFailedMask, formatDuration, formatUnix } from '@/lib/time';
import { BidStatusBadge, outcomeLabel } from './Badges';

/** Plain-language help for the contract's `reason` codes. The raw code is always shown too. */
export function reasonHelp(reason: string): string {
  if (!reason) return '';
  if (reason.startsWith('proposal:'))
    return 'The bidder’s committed proposal could not be reproduced from its hash (mismatch, empty, too large or not UTF-8). This disqualifies the bid and forfeits the bond.';
  if (reason.startsWith('requirements_'))
    return 'The funder’s requirements document could not be used. This never counts against the bidder. Try again later.';
  if (reason === 'proposal_unavailable') return 'The proposal could not be reached. This is retryable and does not disqualify the bid.';
  if (reason === 'consensus_execution_failure' || reason === 'invalid_consensus_result') return 'Validators did not reach a usable result. Try again after the cooldown.';
  if (reason === 'malformed_or_unavailable_model_output' || reason === 'observation_failure') return 'The language model did not return a usable answer. Try again after the cooldown.';
  return '';
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

interface Props {
  tender: Tender;
  bids: Bid[];
  now: bigint;
  actor: Actor;
  onChanged: () => void;
}

export function BidsList({ tender, bids, now, actor, onChanged }: Props) {
  if (bids.length === 0) {
    return <EmptyState title="No bids yet">Sealed bids appear here as soon as bidders commit. Their prices stay hidden until the reveal.</EmptyState>;
  }
  return (
    <ul className="space-y-4">
      {bids.map((bid) => {
        const screened = bid.status === 'compliant' || bid.status === 'noncompliant' || bid.attempts > 0;
        const failed = decodeFailedMask(bid.failed_mask, tender.requirement_count);
        const review = canReview(now, tender, bid, actor);
        const mine = actor.account === bid.bidder;
        const showReview = (actor.account === tender.funder || mine) && bid.status === 'revealed';
        const cooldown = bid.retry_at > now ? bid.retry_at - now : 0n;
        return (
          <li key={bid.bidder} className="surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">{bid.index + 1}</span>
                <Addr address={bid.bidder} you={mine} />
                <BidStatusBadge status={bid.status} />
              </div>
              <p className="font-display text-xl font-semibold">{bid.revealed_at > 0n ? <Gen wei={bid.price} /> : <span className="text-muted">Price sealed</span>}</p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Confidence">{bid.attempts > 0 ? `${bid.confidence} out of 100` : 'Not screened'}</Fact>
              <Fact label="Failed requirements">{!screened ? 'Not screened' : failed.length ? failed.map((n) => `R${n}`).join(', ') : 'None'}</Fact>
              <Fact label="Instruction attempt">{bid.instruction_attempt || 'n/a'}</Fact>
              <Fact label="Screening used">
                {bid.review_calls} calls, {bid.attempts} assessments
              </Fact>
            </dl>

            {cooldown > 0n && bid.status === 'revealed' && <p className="mt-3 text-sm text-warning">Cooldown: the next screening is allowed in {formatDuration(cooldown)}.</p>}
            {bid.outcome && <p className="mt-3 text-sm">{outcomeLabel(bid.outcome)}</p>}
            {bid.reason && (
              <p className="mt-3 text-sm">
                <span className="mono rounded bg-surface-2 px-1.5 py-0.5">{bid.reason}</span> <span className="text-muted">{reasonHelp(bid.reason)}</span>
              </p>
            )}

            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted">Details</summary>
              <dl className="mt-3 space-y-3">
                {bid.rationale && (
                  <Fact label="Validator rationale (untrusted text, never compared or authorizing)">
                    <UntrustedText>{bid.rationale}</UntrustedText>
                  </Fact>
                )}
                <Fact label="Proposal URL">
                  <UntrustedUrl url={bid.proposal_url} />
                </Fact>
                <Fact label="Proposal SHA-256">
                  <HashText value={bid.proposal_hash} />
                </Fact>
                <Fact label="Commitment">
                  <HashText value={bid.commitment} />
                </Fact>
                <Fact label="Sealed at">{formatUnix(bid.committed_at).local}</Fact>
                {bid.revealed_at > 0n && <Fact label="Revealed at">{formatUnix(bid.revealed_at).local}</Fact>}
                <Fact label="Bond still locked">
                  <Gen wei={bid.bond_wei} />
                </Fact>
              </dl>
            </details>

            {showReview && (
              <div className="mt-4 border-t border-border pt-4">
                <TxPanel
                  action="Request screening"
                  variant="secondary"
                  size="sm"
                  compact
                  summary={[]}
                  blockedReason={review.enabled ? null : review.reason}
                  run={(w, p) => w.reviewBid(tender.funder, tender.tender_id, bid.bidder, p)}
                  onSuccess={onChanged}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

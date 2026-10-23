import type { ReactNode } from 'react';
import type { Bid, Tender } from '@/chain/types';
import { LinkButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TxPanel } from '@/components/wallet/TxPanel';
import {
  canCancel,
  canCommit,
  canFinalize,
  canReveal,
  canReview,
  canWithdrawBid,
  type ActionState,
  type Actor,
} from '@/lib/permissions';
import { formatGenSymbol } from '@/lib/units';

function ActionRow({ title, description, state, children }: { title: string; description: string; state: ActionState; children?: ReactNode }) {
  return (
    <li className="surface space-y-3 p-5">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 max-w-[62ch] text-sm leading-6 text-muted">{description}</p>
      </div>
      {children}
      {!state.enabled && state.reason && (
        <p className="text-sm" role="note">
          <span className="text-muted">Not available now: </span>
          {state.reason}
        </p>
      )}
    </li>
  );
}

interface Props {
  tender: Tender;
  bids: Bid[];
  now: bigint;
  actor: Actor;
  onChanged: () => void;
}

/**
 * Role-aware actions. A funder sees funder actions, a bidder sees bidder actions, everyone sees
 * finalize. Anything unavailable says why: wrong phase, wrong role, cooldown, exhausted budget.
 */
export function TenderActions({ tender, bids, now, actor, onChanged }: Props) {
  const isFunder = actor.account === tender.funder;
  const myBid = bids.find((b) => b.bidder === actor.account);
  const commit = canCommit(now, tender, bids, actor);
  const withdraw = canWithdrawBid(now, tender, myBid, actor);
  const reveal = canReveal(now, tender, myBid, actor);
  const cancel = canCancel(now, tender, actor);
  const finalize = canFinalize(now, tender, bids);
  const finalizeGate: ActionState = finalize.enabled ? (actor.account ? (actor.chainReady ? finalize : { enabled: false, reason: 'Switch your wallet to Studionet first.' }) : { enabled: false, reason: 'Connect a wallet to act.' }) : finalize;
  const myReview = myBid ? canReview(now, tender, myBid, actor) : null;
  const bidPath = `/tender/${tender.funder}/${encodeURIComponent(tender.tender_id)}/bid`;

  if (tender.status !== 'open') {
    return <Notice kind="info" title={tender.status === 'finalized' ? 'This tender is settled' : 'This tender was cancelled'}>No more actions are possible. See the Settlement tab.</Notice>;
  }

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {!actor.account && (
        <li className="lg:col-span-2">
          <Notice kind="info" title="Read-only">
            Everything on this page works without a wallet. Connect one to commit, reveal, screen or finalize.
          </Notice>
        </li>
      )}

      {!isFunder && !myBid && (
        <ActionRow title="Place a sealed bid" description="Commit a price and proposal without showing them. Your bond is locked from your credit." state={commit}>
          {commit.enabled && <LinkButton to={bidPath}>Start a bid</LinkButton>}
        </ActionRow>
      )}

      {myBid && (
        <>
          <ActionRow title="Reveal your bid" description="Show your price, proposal URL, hash and salt during the reveal window. Missing it forfeits your bond to the funder." state={reveal}>
            {reveal.enabled && <LinkButton to={`${bidPath}?mode=reveal`}>Reveal my bid</LinkButton>}
          </ActionRow>
          <ActionRow title="Withdraw your bid" description="Take back the sealed bid and its bond before bidding closes. The slot stays used." state={withdraw}>
            {actor.account && withdraw.enabled && (
              <TxPanel
                action="Withdraw bid"
                variant="secondary"
                summary={[
                  { label: 'Method', value: <code>withdraw_bid</code> },
                  { label: 'Bond returned to credit', value: formatGenSymbol(myBid.bond_wei) },
                ]}
                run={(w, p) => w.withdrawBid(tender.funder, tender.tender_id, p)}
                onSuccess={onChanged}
              />
            )}
          </ActionRow>
          {myReview && myBid.status === 'revealed' && (
            <ActionRow title="Screen your own bid" description="Ask validators to check your proposal against the requirements. It can be repeated after each cooldown, within the per-bid limits." state={myReview}>
              {myReview.enabled && (
                <TxPanel
                  action="Request screening"
                  variant="secondary"
                  summary={[{ label: 'Method', value: <code>review_bid</code> }, { label: 'Note', value: 'The first decisive verdict is final.' }]}
                  run={(w, p) => w.reviewBid(tender.funder, tender.tender_id, myBid.bidder, p)}
                  onSuccess={onChanged}
                />
              )}
            </ActionRow>
          )}
        </>
      )}

      {isFunder && (
        <ActionRow
          title="Cancel the tender"
          description="Returns the escrowed budget to your credit. Only possible while no bid has ever been sealed, even one that was withdrawn."
          state={cancel}
        >
          {cancel.enabled && (
            <TxPanel
              action="Cancel tender"
              variant="danger"
              summary={[
                { label: 'Method', value: <code>cancel_tender</code> },
                { label: 'Budget returned to credit', value: formatGenSymbol(tender.budget_wei) },
              ]}
              run={(w, p) => w.cancelTender(tender.tender_id, p)}
              onSuccess={onChanged}
            />
          )}
        </ActionRow>
      )}

      {isFunder && (
        <li className="surface p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold">Screen bids</h3>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-muted">
            As the funder you can request screening for any revealed bid, from the Bids tab, during the screening window.
          </p>
        </li>
      )}

      <ActionRow title="Finalize the tender" description="Anyone can do this once the reveal window has closed and every revealed bid has been screened, or after the review deadline. It credits the ledger and emits no transfers." state={finalizeGate}>
        {finalize.enabled && (
          <TxPanel
            action="Finalize tender"
            summary={[
              { label: 'Method', value: <code>finalize_tender</code> },
              { label: 'Result', value: 'Lowest compliant price wins. Bonds are refunded or forfeited. Everything is credited to the ledger.' },
            ]}
            run={(w, p) => w.finalizeTender(tender.funder, tender.tender_id, p)}
            onSuccess={onChanged}
          />
        )}
      </ActionRow>
    </ul>
  );
}

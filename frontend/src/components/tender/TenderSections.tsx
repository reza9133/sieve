import type { ReactNode } from 'react';
import { SETTLEMENT_LABEL, type RankingEntry, type Tender } from '@/chain/types';
import { Addr, HashText, shortAddress } from '@/components/ui/Addr';
import { Gen, UntrustedText } from '@/components/ui/Gen';
import { EmptyState } from '@/components/ui/Notice';
import { UntrustedUrl } from '@/components/ui/UntrustedUrl';
import { formatUnix } from '@/lib/time';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

function When({ at }: { at: bigint }) {
  const t = formatUnix(at);
  return (
    <span>
      {t.local} <span className="text-muted">/ {t.utc}</span>
    </span>
  );
}

export function Overview({ tender, account }: { tender: Tender; account: string | null }) {
  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <h3 className="text-xl font-semibold">
          <UntrustedText>{tender.title}</UntrustedText>
        </h3>
        <p className="mt-2 max-w-[70ch] leading-7">
          <UntrustedText>{tender.summary}</UntrustedText>
        </p>
      </div>
      <dl className="surface divide-y divide-border">
        <Row label="Tender id">
          <span className="mono">{tender.tender_id}</span>
        </Row>
        <Row label="Funder">
          <Addr address={tender.funder} you={account === tender.funder} full />
        </Row>
        <Row label="Requirements document">
          <UntrustedUrl url={tender.requirements_url} />
        </Row>
        <Row label="Requirements SHA-256">
          <HashText value={tender.requirements_hash} />
        </Row>
        <Row label="Numbered requirements">{tender.requirement_count}</Row>
        <Row label="Budget (escrowed)">
          <Gen wei={tender.budget_wei} />
        </Row>
        <Row label="Bond per bidder">
          <Gen wei={tender.bond_wei} />
        </Row>
        <Row label="Bid slots">
          {tender.bid_count} of {tender.max_bids} used
        </Row>
        <Row label="Opened">
          <When at={tender.created_at} />
        </Row>
        <Row label="Bidding closes (commit_by)">
          <When at={tender.commit_by} />
        </Row>
        <Row label="Reveal closes (reveal_by)">
          <When at={tender.reveal_by} />
        </Row>
        <Row label="Screening ends (review_by)">
          <When at={tender.review_by} />
        </Row>
      </dl>
    </div>
  );
}

export function Ranking({ entries, tender, account }: { entries: RankingEntry[]; tender: Tender; account: string | null }) {
  const settled = tender.status === 'finalized';
  if (entries.length === 0) {
    return (
      <EmptyState title="No compliant bids yet">
        {settled
          ? 'No bid was found compliant, so the whole budget returned to the funder.'
          : 'Bids appear here after validators screen them and find them compliant.'}
      </EmptyState>
    );
  }
  const max = entries.reduce((m, e) => (e.price > m ? e.price : m), 1n);
  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-sm text-muted">
        {settled ? 'The final ranking.' : 'The order finalization will use if it ran now.'} Lowest price first. The earliest commitment wins a tie.
        {!settled && ' More bids may still be screened.'}
      </p>
      <ol className="space-y-3">
        {entries.map((e, i) => (
          <li key={e.bidder} className="surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${i === 0 ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{i + 1}</span>
                <span className="mono">{shortAddress(e.bidder)}</span>
                {account === e.bidder && <span className="rounded bg-accent/15 px-1.5 text-xs text-accent">you</span>}
                <span className="text-xs text-muted">bid #{e.index + 1}</span>
              </p>
              <p className="font-medium">
                <Gen wei={e.price} />
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className={`h-full rounded-full ${i === 0 ? 'bg-accent' : 'bg-accent-2/70'}`} style={{ width: `${Math.max(2, Number((e.price * 100n) / max))}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Settlement({ tender, children }: { tender: Tender; children?: ReactNode }) {
  if (tender.status === 'open') {
    return (
      <div className="space-y-4">
        <EmptyState title="Not settled yet">This tender is still open. Settlement happens when someone finalizes it after the reveal window.</EmptyState>
        {children}
      </div>
    );
  }
  return (
    <dl className="surface divide-y divide-border">
      <Row label="Outcome">{SETTLEMENT_LABEL[tender.settlement] ?? tender.settlement}</Row>
      {tender.winner && (
        <Row label="Winner">
          <Addr address={tender.winner} full />
        </Row>
      )}
      {tender.winner && (
        <Row label="Award price">
          <Gen wei={tender.award_price} />
        </Row>
      )}
      <Row label="Forfeited bonds (to the funder)">
        <Gen wei={tender.forfeited_wei} />
      </Row>
      <Row label="Refunded">
        <Gen wei={tender.refunded_wei} />
      </Row>
      <Row label="Where it went">
        Everything was credited to the internal ledger. Each party withdraws their own credit on the Credit page.
      </Row>
    </dl>
  );
}

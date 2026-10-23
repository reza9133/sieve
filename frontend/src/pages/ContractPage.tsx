import type { ReactNode } from 'react';
import { explorerAddressUrl, RPC_URL, SIEVE_ADDRESS } from '@/chain/config';
import { getInfo } from '@/chain/sieveClient';
import { GenLayerLogo } from '@/components/layout/Logos';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { Addr } from '@/components/ui/Addr';
import { CopyButton } from '@/components/ui/CopyButton';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Gen } from '@/components/ui/Gen';
import { ErrorState, Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLoad } from '@/hooks/useLoad';
import { CONTRACT_VERSION, GENLAYER_DOCS_URL, GITHUB_URL, SOURCE_SHA256 } from '@/lib/constants';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[16rem_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

export default function ContractPage() {
  useDocumentTitle('Contract');
  const info = useLoad(getInfo, []);
  const i = info.data;
  return (
    <>
      <PageHeader
        title="The contract"
        lead="Everything on this site reads and writes one Intelligent Contract on GenLayer Studionet."
        actions={
          <span className="flex items-center gap-3 text-sm text-muted">
            Built on <GenLayerLogo className="h-8" />
          </span>
        }
      />
      <Section>
        <dl className="surface divide-y divide-border">
          <Row label="Address">
            <Addr address={SIEVE_ADDRESS} full />
          </Row>
          <Row label="Explorer">
            <ExternalLink href={explorerAddressUrl(SIEVE_ADDRESS)}>{explorerAddressUrl(SIEVE_ADDRESS)}</ExternalLink>
          </Row>
          <Row label="Network RPC">
            <span className="mono">{RPC_URL}</span>
          </Row>
          <Row label="Version this site expects">{CONTRACT_VERSION}</Row>
          <Row label="Source SHA-256 (contracts/sieve.py)">
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="mono break-all">{SOURCE_SHA256}</span>
              <CopyButton value={SOURCE_SHA256} />
            </span>
          </Row>
          <Row label="Source code">
            <ExternalLink href={GITHUB_URL}>{GITHUB_URL}</ExternalLink>
          </Row>
          <Row label="GenLayer documentation">
            <ExternalLink href={GENLAYER_DOCS_URL}>{GENLAYER_DOCS_URL}</ExternalLink>
          </Row>
        </dl>
        <p className="mt-3 max-w-[70ch] text-sm text-muted">
          This site cannot read the deployed source. To check it yourself, hash <code>contracts/sieve.py</code> from the
          repository and compare it with the value above.
        </p>
      </Section>
      <Section title="Live contract parameters">
        {info.loading ? (
          <div className="space-y-3" role="status" aria-label="Loading contract parameters">
            {Array.from({ length: 6 }, (_, k) => (
              <Skeleton key={k} className="h-8 w-full" />
            ))}
          </div>
        ) : info.error ? (
          <ErrorState error={info.error} onRetry={info.reload} title="The Studionet RPC did not answer" />
        ) : i ? (
          <>
            {i.version !== CONTRACT_VERSION && (
              <div className="mb-4">
                <Notice kind="warning" title={`The contract reports version ${i.version}`}>
                  This site was built for {CONTRACT_VERSION}. Field names or rules may have changed.
                </Notice>
              </div>
            )}
            <dl className="surface divide-y divide-border">
              <Row label="Name and version">
                {i.name} {i.version}
              </Row>
              <Row label="Minimum budget">
                <Gen wei={i.min_budget_wei} />
              </Row>
              <Row label="Minimum bond">
                <Gen wei={i.min_bond_wei} />
              </Row>
              <Row label="Requirements per tender">1 to {i.max_requirements}</Row>
              <Row label="Bids per tender">1 to {i.max_bids_limit}</Row>
              <Row label="Minimum confidence">{i.minimum_confidence} out of 100</Row>
              <Row label="Minimum window">{i.min_window_seconds.toString()} seconds</Row>
              <Row label="Screening window">
                {(i.review_window_seconds / 86400n).toString()} days after the reveal deadline
              </Row>
              <Row label="Screening calls per bid">
                {i.max_review_calls_per_bid} calls, {i.max_semantic_assessments_per_bid} semantic assessments
              </Row>
              <Row label="Retry cooldown">
                {i.retry_cooldown_seconds} seconds, doubling up to {i.max_retry_cooldown_seconds} seconds
              </Row>
              <Row label="Commitment scheme">{i.commitment_scheme}</Row>
              <Row label="Ranking rule">{i.ranking_rule}</Row>
              <Row label="Settlement model">{i.settlement_model}</Row>
              <Row label="Forfeiture policy">{i.forfeiture_policy}</Row>
              <Row label="Decisive verdict policy">{i.decisive_verdict_policy}</Row>
            </dl>
          </>
        ) : null}
      </Section>
    </>
  );
}

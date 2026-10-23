import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { loadTenderBundle } from '@/chain/sieveClient';
import { PageHeader } from '@/components/layout/PageHeader';
import { BidsList } from '@/components/tender/BidsList';
import { TenderStatusBadge } from '@/components/tender/Badges';
import { PhaseStepper } from '@/components/tender/PhaseStepper';
import { TenderActions } from '@/components/tender/TenderActions';
import { Overview, Ranking, Settlement } from '@/components/tender/TenderSections';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyState, ErrorState } from '@/components/ui/Notice';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLoad } from '@/hooks/useLoad';
import { useNow } from '@/hooks/useNow';
import { loadRegistry, recordActivity, togglePin } from '@/lib/storage';
import { normalizeAddress, validateAddress, validateTenderId } from '@/lib/validation';
import { useWallet } from '@/wallet/walletContext';

const TABS = ['overview', 'bids', 'ranking', 'settlement'] as const;
type TabId = (typeof TABS)[number];

export default function TenderPage() {
  const params = useParams();
  const funder = normalizeAddress(params.funder ?? '');
  const tenderId = (params.id ?? '').trim();
  const invalid = validateAddress(funder) ?? validateTenderId(tenderId);
  const [search, setSearch] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(search.get('tab') ?? '') ? (search.get('tab') as TabId) : 'overview';
  const { account, chainReady } = useWallet();
  const now = useNow(1000);
  const [pinned, setPinned] = useState(false);

  const bundle = useLoad(() => loadTenderBundle(funder, tenderId), [funder, tenderId], { enabled: !invalid, pollMs: 30000 });
  const data = bundle.data;
  useDocumentTitle(data ? data.tender.title : 'Tender');

  useEffect(() => {
    if (!data || invalid) return;
    const entries = recordActivity(funder, tenderId, 'viewed', data.tender.title);
    setPinned(entries.find((e) => e.funder === funder && e.tenderId === tenderId)?.tags.includes('pinned') ?? false);
  }, [data?.tender.title, funder, tenderId, invalid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data && account && data.bids.some((b) => b.bidder === account)) recordActivity(funder, tenderId, 'bid', data.tender.title);
    if (data && account && account === data.tender.funder) recordActivity(funder, tenderId, 'opened', data.tender.title);
  }, [data, account, funder, tenderId]);

  if (invalid) {
    return (
      <div className="page py-16">
        <EmptyState title="This tender link is not valid" action={<Link to="/explore" className="text-accent underline underline-offset-4">Find a tender</Link>}>
          {invalid}
        </EmptyState>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/tender/${funder}/${encodeURIComponent(tenderId)}`;
  const actor = { account, chainReady };

  if (bundle.loading) {
    return (
      <div className="page space-y-6 py-12" role="status" aria-label="Loading tender">
        <Skeleton className="h-12 w-2/3" />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={5} />
      </div>
    );
  }
  if (bundle.error && !data) {
    const notFound = /not found/i.test(bundle.error.message);
    return (
      <div className="page py-16">
        {notFound ? (
          <EmptyState title="No such tender" action={<Link to="/explore" className="text-accent underline underline-offset-4">Try another lookup</Link>}>
            The contract has no tender with the id <span className="mono">{tenderId}</span> for funder <span className="mono break-all">{funder}</span>. Check both, including the funder address.
          </EmptyState>
        ) : (
          <ErrorState error={bundle.error} onRetry={bundle.reload} title="Could not load this tender" />
        )}
      </div>
    );
  }
  if (!data) return null;
  const { tender, bids, ranking } = data;

  return (
    <>
      <PageHeader
        title={tender.title}
        lead={
          <span className="flex flex-wrap items-center gap-3 text-base">
            <TenderStatusBadge status={tender.status} />
            {account === tender.funder && <Badge tone="accent">You are the funder</Badge>}
            <span className="mono text-sm text-muted">{tender.tender_id}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={shareUrl} label="Copy share link" />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                togglePin(funder, tenderId);
                setPinned(loadRegistry().find((e) => e.funder === funder && e.tenderId === tenderId)?.tags.includes('pinned') ?? false);
              }}
            >
              {pinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button size="sm" variant="ghost" onClick={bundle.reload} disabled={bundle.refreshing}>
              {bundle.refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        }
      />
      <div className="page space-y-6 pb-8">
        {bundle.error && <ErrorState error={bundle.error} onRetry={bundle.reload} title="Showing older data: the refresh failed" />}
        <PhaseStepper tender={tender} now={now} />
        <section aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="mb-4 text-2xl font-semibold">
            What you can do
          </h2>
          <TenderActions tender={tender} bids={bids} now={now} actor={actor} onChanged={bundle.reload} />
        </section>
        <Tabs
          active={tab}
          onChange={(id) => setSearch({ tab: id }, { replace: true })}
          tabs={[
            { id: 'overview', label: 'Overview', content: <Overview tender={tender} account={account} /> },
            {
              id: 'bids',
              label: 'Bids',
              badge: <Badge>{tender.bid_count}</Badge>,
              content: <BidsList tender={tender} bids={bids} now={now} actor={actor} onChanged={bundle.reload} />,
            },
            { id: 'ranking', label: 'Ranking', content: <Ranking entries={ranking} tender={tender} account={account} /> },
            { id: 'settlement', label: 'Settlement', content: <Settlement tender={tender} /> },
          ]}
        />
        <p className="text-xs text-muted">
          Updated {bundle.updatedAt ? new Date(bundle.updatedAt).toLocaleTimeString() : 'just now'}. This page refreshes about every 30 seconds while it is visible, to stay within the Studionet rate limit.
        </p>
      </div>
    </>
  );
}

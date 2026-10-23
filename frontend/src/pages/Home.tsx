import { getAccounting, getInfo } from '@/chain/sieveClient';
import { GenLayerLogo } from '@/components/layout/Logos';
import { Hero3D } from '@/components/three/Hero3D';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Gen } from '@/components/ui/Gen';
import { CountUp, Tilt } from '@/components/ui/Motion';
import { ErrorState } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLoad } from '@/hooks/useLoad';

const VALUES = [
  {
    title: 'Sealed bids',
    body: 'A bidder commits to a price and a proposal without showing either. After bidding closes, the contract recomputes every commitment. A bidder who never reveals forfeits the bond.',
    className: 'lg:translate-y-0',
  },
  {
    title: 'Validator-screened',
    body: 'Validators fetch the committed requirements and each committed proposal, then classify every mandatory requirement as met, not met or unclear. Only agreement on the decisive findings stands.',
    className: 'lg:translate-y-6',
  },
  {
    title: 'Pull-payment settlement',
    body: 'Finalizing only updates a ledger. No transfer is emitted, so nothing can half-fail. Everyone later withdraws their own credit in a single transfer.',
    className: 'lg:translate-y-12',
  },
];

function LiveStrip() {
  const info = useLoad(getInfo, []);
  const acct = useLoad(getAccounting, [], { pollMs: 45000 });
  if (info.error || acct.error) {
    const e = info.error ?? acct.error;
    return e ? (
      <ErrorState
        error={e}
        title="The Studionet RPC did not answer"
        onRetry={() => {
          info.reload();
          acct.reload();
        }}
      />
    ) : null;
  }
  const loading = info.loading || acct.loading;
  return (
    <dl className="surface grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4" aria-label="Live contract status">
      <div>
        <dt className="text-sm text-muted">Contract version</dt>
        <dd className="mt-1 font-display text-xl font-semibold">{loading || !info.data ? <Skeleton className="h-7 w-16" /> : info.data.version}</dd>
      </div>
      <div>
        <dt className="text-sm text-muted">Minimum budget</dt>
        <dd className="mt-1 font-display text-xl font-semibold">{loading || !info.data ? <Skeleton className="h-7 w-28" /> : <Gen wei={info.data.min_budget_wei} />}</dd>
      </div>
      <div>
        <dt className="text-sm text-muted">Minimum bond</dt>
        <dd className="mt-1 font-display text-xl font-semibold">{loading || !info.data ? <Skeleton className="h-7 w-28" /> : <Gen wei={info.data.min_bond_wei} />}</dd>
      </div>
      <div>
        <dt className="text-sm text-muted">Ledger</dt>
        <dd className="mt-1">{loading || !acct.data ? <Skeleton className="h-7 w-20" /> : <Badge tone={acct.data.solvent ? 'success' : 'danger'}>{acct.data.solvent ? 'Solvent' : 'Shortfall'}</Badge>}</dd>
      </div>
    </dl>
  );
}

export default function Home() {
  useDocumentTitle('');
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="page grid items-center gap-6 pb-10 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div className="relative z-10">
            <Badge tone="warning">Studionet testnet, contract v0.1.0</Badge>
            <h1 className="mt-5 text-5xl font-bold leading-[1.02] sm:text-6xl lg:text-7xl">Sealed bids in. The lowest compliant price out.</h1>
            <p className="mt-6 max-w-[48ch] text-lg leading-8 text-muted">
              Sieve runs sealed-bid reverse auctions on GenLayer. Validators screen every bid against the requirements, and deterministic code picks the lowest compliant price.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/tender/new" size="lg">
                Open a tender
              </LinkButton>
              <LinkButton to="/explore" size="lg" variant="secondary">
                Find a tender
              </LinkButton>
            </div>
            <p className="mt-6 flex items-center gap-3 text-sm text-muted">
              Built on <GenLayerLogo className="h-6" />
            </p>
          </div>
          <div className="relative -mx-4 h-[320px] sm:mx-0 sm:h-[420px] lg:h-[560px]">
            <Hero3D className="h-full w-full" />
          </div>
        </div>
      </section>

      <section className="page py-6" aria-labelledby="live-heading">
        <h2 id="live-heading" className="sr-only">
          Live contract status
        </h2>
        <LiveStrip />
      </section>

      <section className="page py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {VALUES.map((v) => (
            <Tilt key={v.title} className={v.className}>
              <article className="surface h-full p-6 hover:shadow-glow">
                <h3 className="text-2xl font-semibold">{v.title}</h3>
                <p className="mt-3 leading-7 text-muted">{v.body}</p>
              </article>
            </Tilt>
          ))}
        </div>
      </section>

      <section className="page py-12 lg:pt-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <h2 className="text-3xl font-bold sm:text-4xl">Why this needs GenLayer</h2>
          <div className="prose-sieve">
            <p>
              A deterministic contract can enforce commitments, deadlines and payouts. It cannot read two documents and decide whether a free-text proposal really offers a five-year warranty. A single off-chain screener could quietly exclude the cheapest bidder.
            </p>
            <p>
              Sieve asks several validators to fetch the same hash-committed bytes and independently produce a bounded classification. The Equivalence Principle lets a result stand only when validators reproduce the same decisive findings. The free-form rationale is stored but never compared, and never authorizes anything.
            </p>
            <p className="muted">
              Sieve is a primitive, not a procurement system or a legal service. It does not verify delivery, identity or truth.{' '}
              <CountUp value={16} format={(n) => `Up to ${Math.round(n)}`} /> bids per tender, 1 to 8 requirements each.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

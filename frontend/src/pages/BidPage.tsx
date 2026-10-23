import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getAvailableCredit, loadTenderBundle } from '@/chain/sieveClient';
import type { Bid, Tender } from '@/chain/types';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { FileHasher } from '@/components/tender/FileHasher';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { TextField } from '@/components/ui/Field';
import { Gen } from '@/components/ui/Gen';
import { EmptyState, ErrorState, Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { TxPanel } from '@/components/wallet/TxPanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLoad } from '@/hooks/useLoad';
import { useNow } from '@/hooks/useNow';
import { computeCommitment, generateSalt } from '@/lib/commitment';
import { downloadText } from '@/lib/download';
import { canCommit, canReveal } from '@/lib/permissions';
import {
  loadRevealPackage,
  makeBackupJson,
  parseBackupJson,
  recordActivity,
  saveRevealPackage,
  type RevealPackage,
} from '@/lib/storage';
import { formatDuration, formatUnix } from '@/lib/time';
import { formatGenSymbol, parseGen } from '@/lib/units';
import { normalizeAddress, normalizeHash, validateAddress, validateHash, validateHttpsUrl, validateSalt, validateTenderId } from '@/lib/validation';
import { useWallet } from '@/wallet/walletContext';

function WindowNotice({ tender, now }: { tender: Tender; now: bigint }) {
  const c = formatUnix(tender.commit_by).local;
  const r = formatUnix(tender.reveal_by).local;
  return (
    <Notice kind="warning" title="You must reveal between these two times">
      <p>
        The reveal window runs from <strong>{c}</strong> to <strong>{r}</strong>.
        {now < tender.reveal_by && ` ${now < tender.commit_by ? 'It opens' : 'It closes'} in ${formatDuration((now < tender.commit_by ? tender.commit_by : tender.reveal_by) - now)}.`}
      </p>
      <p className="mt-1">If you miss it, or lose your reveal data, you forfeit your bond to the funder.</p>
    </Notice>
  );
}

/* ----------------------------------------------------------------------------- commit */

function CommitFlow({ tender, bids, now, onDone }: { tender: Tender; bids: Bid[]; now: bigint; onDone: () => void }) {
  const { account, chainReady } = useWallet();
  const credit = useLoad(() => getAvailableCredit(account ?? ''), [account], { enabled: Boolean(account) });
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [hash, setHash] = useState('');
  const [salt, setSalt] = useState(() => generateSalt());
  const [commitment, setCommitment] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [committed, setCommitted] = useState(false);

  const priceWei = parseGen(price);
  const errors = {
    price: price && (priceWei === null || priceWei < 1n || priceWei > tender.budget_wei) ? `Enter a price above zero and not above the budget (${formatGenSymbol(tender.budget_wei)}).` : null,
    url: url ? validateHttpsUrl(url) : null,
    hash: hash ? validateHash(hash) : null,
  };
  const ready = Boolean(account && priceWei && priceWei >= 1n && priceWei <= tender.budget_wei && url && hash && !errors.url && !errors.hash && !validateSalt(salt));

  const pkg: RevealPackage | null = useMemo(() => {
    if (!ready || !account || !priceWei || !commitment) return null;
    return {
      funder: tender.funder,
      tenderId: tender.tender_id,
      bidder: account,
      priceWei: priceWei.toString(),
      proposalUrl: url.trim(),
      proposalHash: normalizeHash(hash),
      salt: salt.trim(),
      commitment,
      createdAt: Date.now(),
    };
  }, [ready, account, priceWei, commitment, tender.funder, tender.tender_id, url, hash, salt]);

  useEffect(() => {
    let cancelled = false;
    setCommitment(null);
    if (!ready || !account || !priceWei) return;
    void computeCommitment({
      funder: tender.funder,
      tenderId: tender.tender_id,
      bidder: account,
      priceWei,
      proposalUrl: url.trim(),
      proposalHash: normalizeHash(hash),
      salt: salt.trim(),
    }).then((c) => !cancelled && setCommitment(c));
    return () => {
      cancelled = true;
    };
  }, [ready, account, priceWei, tender.funder, tender.tender_id, url, hash, salt]);

  // Any change to the sealed inputs invalidates the backup the user confirmed.
  useEffect(() => {
    setBackedUp(false);
    setConfirmed(false);
  }, [commitment]);

  const gate = canCommit(now, tender, bids, { account, chainReady });
  const enoughCredit = credit.data !== null && credit.data >= tender.bond_wei;
  const blocked = !gate.enabled
    ? gate.reason
    : !pkg
      ? 'Fill in the price, proposal URL and proposal hash.'
      : credit.data !== null && !enoughCredit
        ? 'Your available credit is below the bond. Deposit more on the Credit page.'
        : !confirmed
          ? 'Back up your reveal data and tick the confirmation first.'
          : null;

  const backup = (copy: boolean) => {
    if (!pkg) return;
    saveRevealPackage(pkg); // also kept in this browser
    const json = makeBackupJson(pkg);
    if (copy) void navigator.clipboard?.writeText(json).catch(() => window.prompt('Copy this backup', json));
    else downloadText(`sieve-reveal-${tender.tender_id}.json`, json);
    setBackedUp(true);
  };

  if (committed) {
    return (
      <div className="space-y-4">
        <Notice kind="success" title="Your sealed bid is recorded">
          Come back during the reveal window to reveal it. Your backup is saved in this browser and in the file you downloaded.
        </Notice>
        <WindowNotice tender={tender} now={now} />
        <Link className="text-accent underline underline-offset-4" to={`/tender/${tender.funder}/${encodeURIComponent(tender.tender_id)}`}>
          Back to the tender
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <WindowNotice tender={tender} now={now} />
      <div className="grid gap-6 md:grid-cols-2">
        <TextField label="Your price in GEN" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} hint="Hidden until you reveal. The lowest compliant price wins." />
        <div className="surface p-4 text-sm">
          <p className="text-muted">Bond locked from your credit</p>
          <p className="mt-1 text-lg font-semibold">
            <Gen wei={tender.bond_wei} />
          </p>
          <p className="mt-1 text-muted">
            Available: {credit.data !== null ? <Gen wei={credit.data} /> : account ? 'loading' : 'connect a wallet'}.{' '}
            <Link to="/wallet" className="text-accent underline underline-offset-4">
              Top up
            </Link>
          </p>
        </div>
        <div className="md:col-span-2">
          <TextField label="Proposal URL" mono value={url} onChange={(e) => setUrl(e.target.value)} error={errors.url} placeholder="https://example.com/proposal.md" hint="Validators will fetch this exact file over public HTTPS during screening." />
        </div>
        <div className="md:col-span-2 space-y-4">
          <TextField label="Proposal SHA-256" mono value={hash} onChange={(e) => setHash(e.target.value)} error={errors.hash} placeholder="0x…" />
          <FileHasher onHash={setHash} label="Hash your proposal file" />
        </div>
      </div>

      <div className="surface space-y-4 p-5">
        <h3 className="text-lg font-semibold">Your salt and commitment</h3>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Salt</span>
          <span className="mono break-all">{salt}</span>
          <CopyButton value={salt} />
          <Button size="sm" variant="ghost" onClick={() => setSalt(generateSalt())}>
            Generate a new one
          </Button>
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Commitment</span>
          {commitment ? (
            <>
              <span className="mono break-all">{commitment}</span>
              <CopyButton value={commitment} />
            </>
          ) : (
            <span className="text-muted">{account ? 'Complete the form to compute it.' : 'Connect a wallet: the commitment includes your address.'}</span>
          )}
        </p>
        <p className="text-xs text-muted">Computed in this browser. Your price, URL, hash and salt are never sent anywhere until you reveal.</p>
      </div>

      <div className="surface space-y-4 border-warning/50 p-5">
        <h3 className="text-lg font-semibold">Back up your reveal data</h3>
        <p className="max-w-[62ch] text-sm leading-6">
          The backup holds your price, URL, hash and salt. Without them you cannot reveal and you lose your bond. Keep the file somewhere you will find it, and treat it as private until you reveal.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={!pkg} onClick={() => backup(false)}>
            Download backup file
          </Button>
          <Button variant="secondary" disabled={!pkg} onClick={() => backup(true)}>
            Copy backup JSON
          </Button>
        </div>
        <label className={`flex items-start gap-3 text-sm ${backedUp ? '' : 'opacity-60'}`}>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" checked={confirmed} disabled={!backedUp} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I saved my reveal backup.</span>
        </label>
      </div>

      <TxPanel
        action="Commit sealed bid"
        size="lg"
        blockedReason={blocked}
        warnings={['You are locking the bond now. It is refunded unless you miss the reveal window or your proposal cannot be reproduced from its hash.']}
        summary={[
          { label: 'Method', value: <code>commit_bid</code> },
          { label: 'Tender', value: `${tender.tender_id} by ${tender.funder}` },
          { label: 'Bond locked', value: formatGenSymbol(tender.bond_wei) },
          { label: 'What goes on-chain', value: 'Only the commitment hash. Your price stays hidden.' },
          { label: 'Reveal window', value: `${formatUnix(tender.commit_by).local} to ${formatUnix(tender.reveal_by).local}` },
        ]}
        run={(w, p) => {
          if (pkg) saveRevealPackage(pkg);
          return w.commitBid(tender.funder, tender.tender_id, pkg?.commitment ?? '', p);
        }}
        onSuccess={() => {
          if (account) recordActivity(tender.funder, tender.tender_id, 'bid', tender.title);
          setCommitted(true);
          onDone();
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------------- reveal */

function RevealFlow({ tender, myBid, now, onDone }: { tender: Tender; myBid: Bid | undefined; now: bigint; onDone: () => void }) {
  const { account, chainReady } = useWallet();
  const [pkg, setPkg] = useState<RevealPackage | null>(() => (account ? loadRevealPackage(tender.funder, tender.tender_id, account) : null));
  const [importError, setImportError] = useState<string | null>(null);
  const [match, setMatch] = useState<'checking' | 'ok' | 'internal' | 'chain' | null>(null);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (account && !pkg) setPkg(loadRevealPackage(tender.funder, tender.tender_id, account));
  }, [account, pkg, tender.funder, tender.tender_id]);

  useEffect(() => {
    let cancelled = false;
    if (!pkg || !myBid || !account) {
      setMatch(null);
      return;
    }
    setMatch('checking');
    void computeCommitment({
      funder: tender.funder,
      tenderId: tender.tender_id,
      bidder: account,
      priceWei: BigInt(pkg.priceWei),
      proposalUrl: pkg.proposalUrl,
      proposalHash: pkg.proposalHash,
      salt: pkg.salt,
    }).then((c) => {
      if (cancelled) return;
      setMatch(c !== pkg.commitment ? 'internal' : c !== myBid.commitment.toLowerCase() ? 'chain' : 'ok');
    });
    return () => {
      cancelled = true;
    };
  }, [pkg, myBid, account, tender.funder, tender.tender_id]);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseBackupJson(await file.text());
    if (!parsed.ok) return setImportError(parsed.error);
    const p = parsed.pkg;
    if (p.funder !== tender.funder || p.tenderId !== tender.tender_id) return setImportError('This backup is for a different tender.');
    if (account && p.bidder !== account) return setImportError('This backup belongs to a different account. Switch to that account in your wallet.');
    setImportError(null);
    saveRevealPackage(p);
    setPkg(p);
  };

  if (!account) return <EmptyState title="Connect the wallet you bid with">Reveals are signed by the same account that committed the bid.</EmptyState>;
  if (!myBid) return <EmptyState title="This account has no bid on this tender">If you bid from another account, switch to it in your wallet.</EmptyState>;
  if (myBid.status !== 'committed' && !done) {
    return <Notice kind="info" title={`Your bid is already ${myBid.status}`}>Nothing more to reveal.</Notice>;
  }
  if (done) return <Notice kind="success" title="Your bid is revealed">Validators can now screen it. The funder or you can request screening once the screening window opens.</Notice>;

  const gate = canReveal(now, tender, myBid, { account, chainReady });
  const blocked = !gate.enabled ? gate.reason : !pkg ? 'Restore your reveal backup first.' : match !== 'ok' ? 'Your reveal data does not match the on-chain commitment.' : null;

  return (
    <div className="space-y-6">
      <WindowNotice tender={tender} now={now} />
      {!pkg ? (
        <div className="surface space-y-3 p-5">
          <h3 className="text-lg font-semibold">Restore your reveal backup</h3>
          <p className="text-sm text-muted">No backup for this tender was found in this browser. Import the file you downloaded when you committed.</p>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            Import backup file
          </Button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose your reveal backup file" onChange={(e) => void importFile(e.target.files?.[0])} />
          {importError && <Notice kind="danger">{importError}</Notice>}
        </div>
      ) : (
        <div className="surface space-y-3 p-5 text-sm">
          <h3 className="text-lg font-semibold">Your reveal data</h3>
          <dl className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Price</dt>
            <dd>
              <Gen wei={BigInt(pkg.priceWei)} />
            </dd>
            <dt className="text-muted">Proposal URL</dt>
            <dd className="mono break-all">{pkg.proposalUrl}</dd>
            <dt className="text-muted">Proposal SHA-256</dt>
            <dd className="mono break-all">{pkg.proposalHash}</dd>
            <dt className="text-muted">Commitment</dt>
            <dd className="mono break-all">{pkg.commitment}</dd>
          </dl>
          {match === 'checking' && <p className="text-muted">Checking against the chain…</p>}
          {match === 'ok' && <Notice kind="success" title="Matches your on-chain commitment">Recomputed locally from your data.</Notice>}
          {match === 'internal' && <Notice kind="danger" title="This backup is inconsistent">Its fields do not produce its own commitment. Do not reveal with it. Restore the original file.</Notice>}
          {match === 'chain' && <Notice kind="danger" title="This does not match the commitment on the chain">The data is internally consistent but is not the bid you sealed on this tender. Sieve will not send it.</Notice>}
          <Button size="sm" variant="ghost" onClick={() => setPkg(null)}>
            Use a different backup
          </Button>
        </div>
      )}
      <TxPanel
        action="Reveal bid"
        size="lg"
        blockedReason={blocked}
        summary={
          pkg
            ? [
                { label: 'Method', value: <code>reveal_bid</code> },
                { label: 'Price made public', value: formatGenSymbol(BigInt(pkg.priceWei)) },
                { label: 'Proposal made public', value: pkg.proposalUrl },
                { label: 'Result', value: 'The contract recomputes your commitment. If it matches, the bid becomes screenable.' },
              ]
            : []
        }
        run={(w, p) => {
          if (!pkg) throw new Error('No reveal data');
          return w.revealBid(tender.funder, tender.tender_id, BigInt(pkg.priceWei), pkg.proposalUrl, pkg.proposalHash, pkg.salt, p);
        }}
        onSuccess={() => {
          setDone(true);
          onDone();
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------------- page */

export default function BidPage() {
  const params = useParams();
  const funder = normalizeAddress(params.funder ?? '');
  const tenderId = (params.id ?? '').trim();
  const invalid = validateAddress(funder) ?? validateTenderId(tenderId);
  const [search, setSearch] = useSearchParams();
  const { account } = useWallet();
  const now = useNow(1000);
  const bundle = useLoad(() => loadTenderBundle(funder, tenderId), [funder, tenderId], { enabled: !invalid, pollMs: 30000 });
  useDocumentTitle('Bid');

  if (invalid) return <div className="page py-16"><EmptyState title="This link is not valid">{invalid}</EmptyState></div>;
  if (bundle.loading) {
    return (
      <div className="page space-y-4 py-12" role="status" aria-label="Loading tender">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (bundle.error && !bundle.data) return <div className="page py-16"><ErrorState error={bundle.error} onRetry={bundle.reload} title="Could not load this tender" /></div>;
  if (!bundle.data) return null;
  const { tender, bids } = bundle.data;
  const myBid = bids.find((b) => b.bidder === account);
  const requested = search.get('mode');
  const mode = requested === 'reveal' || requested === 'commit' ? requested : myBid && myBid.status === 'committed' && now >= tender.commit_by ? 'reveal' : 'commit';

  return (
    <>
      <PageHeader
        title={`Bid on ${tender.title}`}
        lead={
          <Link className="text-base text-accent underline underline-offset-4" to={`/tender/${tender.funder}/${encodeURIComponent(tender.tender_id)}`}>
            Back to the tender
          </Link>
        }
      />
      <Section>
        {tender.status !== 'open' && <div className="mb-6"><Notice kind="warning" title="This tender is not open">Bidding and revealing are closed.</Notice></div>}
        <Tabs
          active={mode}
          onChange={(id) => setSearch({ mode: id }, { replace: true })}
          tabs={[
            { id: 'commit', label: 'Commit a bid', content: <CommitFlow tender={tender} bids={bids} now={now} onDone={bundle.reload} /> },
            { id: 'reveal', label: 'Reveal your bid', content: <RevealFlow tender={tender} myBid={myBid} now={now} onDone={bundle.reload} /> },
          ]}
        />
      </Section>
    </>
  );
}

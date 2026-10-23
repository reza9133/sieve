import { useEffect, useRef, useState } from 'react';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { FileHasher } from '@/components/tender/FileHasher';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { computeCommitment, generateSalt } from '@/lib/commitment';
import { downloadText } from '@/lib/download';
import {
  exportRegistryJson,
  importRegistryJson,
  listRevealPackages,
  makeBackupJson,
  parseBackupJson,
  saveRevealPackage,
  type RevealPackage,
} from '@/lib/storage';
import { formatUnix, nowSeconds } from '@/lib/time';
import { formatGen, parseGen } from '@/lib/units';
import {
  deadlinesFromDurations,
  normalizeAddress,
  normalizeHash,
  validateAddress,
  validateDeadlines,
  validateHash,
  validateHttpsUrl,
  validateSalt,
  validateTenderId,
} from '@/lib/validation';

function ToolCard({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <section className="surface space-y-5 p-6">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-[62ch] text-sm leading-6 text-muted">{lead}</p>
      </div>
      {children}
    </section>
  );
}

function CommitmentCalculator() {
  const [f, setF] = useState({ funder: '', tenderId: '', bidder: '', price: '', url: '', hash: '', salt: '' });
  const [out, setOut] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const price = parseGen(f.price);
  const errors = {
    funder: f.funder ? validateAddress(f.funder) : null,
    tenderId: f.tenderId ? validateTenderId(f.tenderId) : null,
    bidder: f.bidder ? validateAddress(f.bidder) : null,
    price: f.price && (price === null || price === 0n) ? 'Enter a positive amount in GEN.' : null,
    url: f.url ? validateHttpsUrl(f.url) : null,
    hash: f.hash ? validateHash(f.hash) : null,
    salt: f.salt ? validateSalt(f.salt) : null,
  };
  const complete =
    f.funder && f.tenderId && f.bidder && f.url && f.hash && f.salt && price && price > 0n && Object.values(errors).every((e) => e === null);
  useEffect(() => {
    let cancelled = false;
    if (!complete || !price) {
      setOut(null);
      return;
    }
    void computeCommitment({
      funder: normalizeAddress(f.funder),
      tenderId: f.tenderId.trim(),
      bidder: normalizeAddress(f.bidder),
      priceWei: price,
      proposalUrl: f.url.trim(),
      proposalHash: normalizeHash(f.hash),
      salt: f.salt.trim(),
    }).then((c) => !cancelled && setOut(c));
    return () => {
      cancelled = true;
    };
  }, [complete, price, f]);

  return (
    <ToolCard
      title="Commitment calculator"
      lead="Computes the sealed-bid commitment entirely in this tab, with no network access. Use it to double-check a commitment or to rebuild one from a backup."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label="Funder address" mono value={f.funder} onChange={set('funder')} error={errors.funder} />
        <TextField label="Tender id" mono value={f.tenderId} onChange={set('tenderId')} error={errors.tenderId} />
        <TextField label="Bidder address" mono value={f.bidder} onChange={set('bidder')} error={errors.bidder} />
        <TextField label="Price in GEN" inputMode="decimal" value={f.price} onChange={set('price')} error={errors.price} />
        <div className="md:col-span-2">
          <TextField label="Proposal URL" mono value={f.url} onChange={set('url')} error={errors.url} />
        </div>
        <div className="md:col-span-2">
          <TextField label="Proposal SHA-256" mono value={f.hash} onChange={set('hash')} error={errors.hash} />
        </div>
        <div className="md:col-span-2">
          <TextField label="Salt" mono value={f.salt} onChange={set('salt')} error={errors.salt} hint="16 to 64 characters from A-Z a-z 0-9 _ . ~ -" />
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => setF((s) => ({ ...s, salt: generateSalt() }))}>
              Generate a salt
            </Button>
          </div>
        </div>
      </div>
      <div aria-live="polite" className="rounded-lg bg-surface-2 p-4">
        <p className="text-sm text-muted">Commitment</p>
        {out ? (
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="mono break-all">{out}</span>
            <CopyButton value={out} />
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">Fill in every field to see the commitment.</p>
        )}
      </div>
    </ToolCard>
  );
}

function BackupTool() {
  const [packages, setPackages] = useState<RevealPackage[]>(() => listRevealPackages());
  const [message, setMessage] = useState<{ kind: 'success' | 'danger' | 'warning'; text: string } | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const activityInput = useRef<HTMLInputElement>(null);

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseBackupJson(await file.text());
    if (!parsed.ok) return setMessage({ kind: 'danger', text: parsed.error });
    const p = parsed.pkg;
    const recomputed = await computeCommitment({
      funder: p.funder,
      tenderId: p.tenderId,
      bidder: p.bidder,
      priceWei: BigInt(p.priceWei),
      proposalUrl: p.proposalUrl,
      proposalHash: p.proposalHash,
      salt: p.salt,
    });
    if (recomputed !== p.commitment) {
      return setMessage({ kind: 'danger', text: 'This backup is inconsistent: its fields do not produce its own commitment. It was not imported.' });
    }
    const saved = saveRevealPackage({ ...p, createdAt: p.createdAt ?? Date.now() });
    setPackages(listRevealPackages());
    setMessage(saved ? { kind: 'success', text: 'Backup restored in this browser.' } : { kind: 'warning', text: 'Browser storage is blocked, so the backup could not be saved here.' });
  };
  const importActivity = async (file: File | undefined) => {
    if (!file) return;
    const result = importRegistryJson(await file.text());
    setMessage(result.ok ? { kind: 'success', text: `Imported ${result.count} tender${result.count === 1 ? '' : 's'}.` } : { kind: 'danger', text: result.error });
  };

  return (
    <ToolCard
      title="Backups"
      lead="Reveal backups hold everything you need to reveal a sealed bid. Keep them somewhere safe: they contain your price and salt. The activity list is the set of tenders this browser remembers."
    >
      <div>
        <h3 className="mb-2 font-medium">Reveal backups in this browser</h3>
        {packages.length === 0 ? (
          <p className="text-sm text-muted">None yet. One is saved automatically before you commit a bid.</p>
        ) : (
          <ul className="space-y-2">
            {packages.map((p) => (
              <li key={p.commitment} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <span className="min-w-0">
                  <span className="mono block truncate">{p.tenderId}</span>
                  <span className="text-muted">price {formatGen(BigInt(p.priceWei))} GEN</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => downloadText(`sieve-reveal-${p.tenderId}.json`, makeBackupJson(p))}>
                  Download
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => backupInput.current?.click()}>
          Restore a reveal backup
        </Button>
        <input ref={backupInput} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose a reveal backup file" onChange={(e) => void importBackup(e.target.files?.[0])} />
        <Button variant="secondary" onClick={() => downloadText('sieve-activity.json', exportRegistryJson())}>
          Export my tenders
        </Button>
        <Button variant="secondary" onClick={() => activityInput.current?.click()}>
          Import my tenders
        </Button>
        <input ref={activityInput} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose an activity file" onChange={(e) => void importActivity(e.target.files?.[0])} />
      </div>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </ToolCard>
  );
}

const DURATIONS: Array<[string, number]> = [
  ['3 minutes', 180],
  ['10 minutes', 600],
  ['30 minutes', 1800],
  ['1 hour', 3600],
  ['6 hours', 21600],
  ['1 day', 86400],
  ['3 days', 259200],
  ['7 days', 604800],
];

function DeadlineConverter() {
  const [bidding, setBidding] = useState(3600);
  const [reveal, setReveal] = useState(3600);
  const [unix, setUnix] = useState('');
  const now = nowSeconds();
  const d = deadlinesFromDurations(now, BigInt(bidding), BigInt(reveal));
  const check = validateDeadlines(now, d);
  const parsed = /^\d{1,12}$/.test(unix.trim()) ? formatUnix(BigInt(unix.trim())) : null;
  const row = (label: string, at: bigint) => (
    <tr key={label} className="border-t border-border">
      <th scope="row" className="py-2 pr-4 text-left font-normal text-muted">
        {label}
      </th>
      <td className="mono py-2 pr-4">{at.toString()}</td>
      <td className="py-2 pr-4">{formatUnix(at).local}</td>
      <td className="py-2">{formatUnix(at).utc}</td>
    </tr>
  );
  const select = (label: string, value: number, on: (n: number) => void) => (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(e) => on(Number(e.target.value))}>
        {DURATIONS.map(([text, seconds]) => (
          <option key={seconds} value={seconds}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <ToolCard title="Deadline converter" lead="Turns durations from now into the unix timestamps the contract uses, and unix timestamps back into dates. Computed from this device's clock.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {select('Bidding closes in', bidding, setBidding)}
        {select('Reveal window lasts', reveal, setReveal)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Deadlines as unix seconds, local time and UTC</caption>
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-2 font-normal">Deadline</th>
              <th className="pb-2 font-normal">Unix seconds</th>
              <th className="pb-2 font-normal">Local time</th>
              <th className="pb-2 font-normal">UTC</th>
            </tr>
          </thead>
          <tbody>
            {row('commit_by', d.commitBy)}
            {row('reveal_by', d.revealBy)}
            {row('review_by', d.revealBy + 259200n)}
          </tbody>
        </table>
      </div>
      {check && <Notice kind="warning">{check}</Notice>}
      <TextField label="Unix seconds to date" mono inputMode="numeric" value={unix} onChange={(e) => setUnix(e.target.value)} placeholder="1800000000" />
      {parsed && (
        <p className="text-sm">
          {parsed.local} <span className="text-muted">local</span>, {parsed.utc}
        </p>
      )}
    </ToolCard>
  );
}

export default function Tools() {
  useDocumentTitle('Tools');
  return (
    <>
      <PageHeader title="Tools" lead="Everything here runs in your browser and works without a wallet. Nothing you type is sent anywhere." />
      <Section>
        <div className="grid grid-cols-1 gap-8">
          <CommitmentCalculator />
          <ToolCard title="File hasher" lead="Get the SHA-256 for a requirements or proposal file, in the 0x format the contract expects.">
            <FileHasher />
          </ToolCard>
          <BackupTool />
          <DeadlineConverter />
        </div>
      </Section>
    </>
  );
}

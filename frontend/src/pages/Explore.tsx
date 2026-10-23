import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { shortAddress } from '@/components/ui/Addr';
import { Badge } from '@/components/ui/Badge';
import { TextField } from '@/components/ui/Field';
import { EmptyState, Notice } from '@/components/ui/Notice';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { loadRegistry, recordActivity, removeEntry, togglePin, type RegistryEntry } from '@/lib/storage';
import { normalizeAddress, validateAddress, validateTenderId } from '@/lib/validation';

export default function Explore() {
  useDocumentTitle('Find a tender');
  const navigate = useNavigate();
  const [funder, setFunder] = useState('');
  const [tenderId, setTenderId] = useState('');
  const [touched, setTouched] = useState(false);
  const [entries, setEntries] = useState<RegistryEntry[]>(() => loadRegistry());

  const funderError = touched ? validateAddress(funder) : null;
  const idError = touched ? validateTenderId(tenderId) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (validateAddress(funder) || validateTenderId(tenderId)) return;
    const f = normalizeAddress(funder);
    const id = tenderId.trim();
    setEntries(recordActivity(f, id, 'viewed'));
    navigate(`/tender/${f}/${encodeURIComponent(id)}`);
  };

  const sorted = [...entries].sort((a, b) => Number(b.tags.includes('pinned')) - Number(a.tags.includes('pinned')) || b.updatedAt - a.updatedAt);

  return (
    <>
      <PageHeader title="Find a tender" lead="Look a tender up by the funder's address and the tender id. Anyone who shares a tender gives you both, or a link that contains them." />
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <form onSubmit={submit} className="surface space-y-5 p-6" noValidate>
            <TextField
              label="Funder address"
              mono
              placeholder="0x…"
              value={funder}
              onChange={(e) => setFunder(e.target.value)}
              error={funderError}
            />
            <TextField label="Tender id" mono placeholder="tender-001" value={tenderId} onChange={(e) => setTenderId(e.target.value)} error={idError} />
            <Button type="submit">Open tender</Button>
          </form>
          <div className="space-y-4">
            <Notice kind="info" title="Why there is no list of all tenders">
              The contract has no view that lists tenders and emits no events that Sieve can rely on. A tender exists only under its
              funder and id. This page keeps a list in your browser of the tenders you open, bid on or look up.
            </Notice>
            <div className="surface p-4 text-sm">
              <p className="font-medium">Share link format</p>
              <p className="mono mt-1 break-all text-muted">/tender/&lt;funder address&gt;/&lt;tender id&gt;</p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Your tenders on this device">
        {sorted.length === 0 ? (
          <EmptyState title="Nothing here yet">Tenders you open, bid on or look up appear here. Everything stays in this browser.</EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {sorted.map((entry) => (
              <li key={`${entry.funder}:${entry.tenderId}`} className="surface flex flex-col gap-3 p-4">
                <div className="min-w-0">
                  <Link
                    to={`/tender/${entry.funder}/${encodeURIComponent(entry.tenderId)}`}
                    className="block truncate font-display text-lg font-semibold text-text hover:text-accent"
                  >
                    {entry.title ?? entry.tenderId}
                  </Link>
                  <p className="mono truncate text-xs text-muted">
                    {entry.tenderId} by {shortAddress(entry.funder)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {entry.tags.map((t) => (
                    <Badge key={t} tone={t === 'pinned' ? 'accent' : 'neutral'}>
                      {t === 'opened' ? 'You opened it' : t === 'bid' ? 'You bid' : t === 'pinned' ? 'Pinned' : 'Looked up'}
                    </Badge>
                  ))}
                  <span className="grow" />
                  <Button size="sm" variant="ghost" onClick={() => setEntries(togglePin(entry.funder, entry.tenderId))}>
                    {entry.tags.includes('pinned') ? 'Unpin' : 'Pin'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEntries(removeEntry(entry.funder, entry.tenderId))}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-muted">
          Export or import this list in <Link className="text-accent underline underline-offset-4" to="/tools">Tools</Link>.
        </p>
      </Section>
    </>
  );
}

import { explorerAddressUrl } from '@/chain/config';
import { CopyButton } from './CopyButton';
import { ExternalLink } from './ExternalLink';

export const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** Address with copy + explorer link. `full` shows the whole string (wrapping on small screens). */
export function Addr({ address, full, you }: { address: string; full?: boolean; you?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="mono break-all" title={address}>
        {full ? address : shortAddress(address)}
      </span>
      {you && <span className="rounded bg-accent/15 px-1.5 text-xs text-accent">you</span>}
      <CopyButton value={address} />
      <ExternalLink href={explorerAddressUrl(address)} className="text-xs">
        Explorer
      </ExternalLink>
    </span>
  );
}

export function HashText({ value, short }: { value: string; short?: boolean }) {
  if (!value) return <span className="text-muted">none</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="mono break-all" title={value}>
        {short ? `${value.slice(0, 10)}…${value.slice(-6)}` : value}
      </span>
      <CopyButton value={value} />
    </span>
  );
}

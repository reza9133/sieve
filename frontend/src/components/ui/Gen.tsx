import { formatGen, formatWei } from '@/lib/units';

/** An amount in GEN with the exact wei value on hover. BigInt only. */
export function Gen({ wei, decimals }: { wei: bigint; decimals?: number }) {
  return (
    <span title={formatWei(wei)} className="whitespace-nowrap">
      {formatGen(wei, decimals === undefined ? {} : { maxDecimals: decimals })} <span className="text-muted">GEN</span>
    </span>
  );
}

/** On-chain strings are untrusted: rendered strictly as text, never as markup. */
export function UntrustedText({ children, className = '' }: { children: string; className?: string }) {
  return <span className={`whitespace-pre-wrap break-words ${className}`}>{children}</span>;
}

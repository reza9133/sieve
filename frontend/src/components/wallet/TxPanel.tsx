import { useState, type ReactNode } from 'react';
import { explorerTxUrl } from '@/chain/config';
import type { TxOutcome, TxProgress, Writer } from '@/chain/sieveClient';
import { Button } from '@/components/ui/Button';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Notice } from '@/components/ui/Notice';
import { CopyButton } from '@/components/ui/CopyButton';
import { useWallet } from '@/wallet/walletContext';

export interface SummaryRow {
  label: string;
  value: ReactNode;
}

interface Props {
  /** What the action is called; the button and the success message reuse this name. */
  action: string;
  summary: SummaryRow[];
  warnings?: ReactNode[];
  /** When set the button is disabled and this explains why. */
  blockedReason?: string | null;
  run: (writer: Writer, onProgress: (p: TxProgress) => void) => Promise<TxOutcome>;
  onSuccess?: (outcome: TxOutcome) => void;
  variant?: 'primary' | 'danger' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  /** Compact: render only the button + status (summary lives in a details block). */
  compact?: boolean;
}

const STEPS: Array<{ key: TxProgress['stage']; label: string }> = [
  { key: 'awaiting-wallet', label: 'Confirm in your wallet' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'finalizing', label: 'Waiting for finalization (about 40 seconds)' },
  { key: 'done', label: 'Finalized' },
];

/**
 * One write flow: pre-flight summary, wallet confirmation, submitted (tx hash + explorer),
 * waiting for finalization, then success or the decoded contract error.
 */
export function TxPanel({ action, summary, warnings, blockedReason, run, onSuccess, variant = 'primary', size = 'md', compact }: Props) {
  const { writer, account, openModal, chainReady, switchNetwork } = useWallet();
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const [outcome, setOutcome] = useState<TxOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!writer || busy) return;
    setBusy(true);
    setOutcome(null);
    setProgress({ stage: 'awaiting-wallet' });
    const result = await run(writer, (p) => setProgress((prev) => ({ ...p, hash: p.hash ?? prev?.hash })));
    setOutcome(result);
    setBusy(false);
    if (result.ok) onSuccess?.(result);
  };

  const hash = outcome?.hash || progress?.hash;
  const stageIndex = progress ? STEPS.findIndex((s) => s.key === progress.stage) : -1;

  return (
    <div className="space-y-4">
      {summary.length > 0 && (
        <dl className={`surface divide-y divide-border text-sm ${compact ? 'hidden' : ''}`}>
          <div className="px-4 py-2.5 font-medium">What will happen</div>
          {summary.map((row) => (
            <div key={row.label} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[11rem_1fr]">
              <dt className="text-muted">{row.label}</dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {warnings?.map((w, i) => (
        <Notice key={i} kind="warning">
          {w}
        </Notice>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        {!account ? (
          <Button size={size} onClick={openModal}>
            Connect wallet to {action.toLowerCase()}
          </Button>
        ) : !chainReady ? (
          <Button size={size} onClick={() => void switchNetwork()}>
            Switch to Studionet
          </Button>
        ) : (
          <Button size={size} variant={variant} onClick={() => void go()} disabled={busy || Boolean(blockedReason)} aria-describedby={blockedReason ? 'tx-blocked' : undefined}>
            {busy ? 'Working…' : action}
          </Button>
        )}
        {blockedReason && account && chainReady && (
          <p id="tx-blocked" className="text-sm text-muted">
            {blockedReason}
          </p>
        )}
      </div>

      {progress && (
        <ol className="space-y-1.5 text-sm" aria-live="polite" aria-label="Transaction progress">
          {STEPS.map((s, i) => {
            const failed = progress.stage === 'failed';
            const reached = i <= stageIndex || (progress.stage === 'done' && true);
            const current = i === stageIndex && !failed && progress.stage !== 'done';
            return (
              <li key={s.key} className={`flex items-center gap-2 ${reached ? 'text-text' : 'text-muted'}`}>
                <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${reached ? 'bg-accent' : 'bg-border'} ${current ? 'animate-pulse' : ''}`} />
                {s.label}
              </li>
            );
          })}
        </ol>
      )}

      {hash && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Transaction</span>
          <span className="mono break-all">{hash}</span>
          <CopyButton value={hash} />
          <ExternalLink href={explorerTxUrl(hash)}>Explorer</ExternalLink>
        </p>
      )}

      {outcome?.ok && <Notice kind="success" title={`${action}: done`}>The transaction finalized and the contract accepted it. Data on this page refreshes shortly.</Notice>}
      {outcome && !outcome.ok && outcome.error && (
        <Notice kind="danger" title={`${action}: failed`}>
          <p>{outcome.error.message}</p>
          <details className="mt-2 text-muted">
            <summary className="cursor-pointer">Details</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{outcome.error.details}</pre>
          </details>
        </Notice>
      )}
    </div>
  );
}

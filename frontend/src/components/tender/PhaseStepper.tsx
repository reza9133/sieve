import { motion, useReducedMotion } from 'framer-motion';
import type { Tender } from '@/chain/types';
import { Badge } from '@/components/ui/Badge';
import { formatDuration, formatUnix, nextBoundary, PHASE_LABEL, phaseAt, type Phase } from '@/lib/time';

const STEPS: Array<{ phase: Phase; hint: string }> = [
  { phase: 'bidding', hint: 'Commit or withdraw sealed bids' },
  { phase: 'reveal', hint: 'Bidders reveal price and proposal' },
  { phase: 'screening', hint: 'Validators screen revealed bids' },
  { phase: 'closed', hint: 'Anyone can finalize' },
];

export function PhaseStepper({ tender, now }: { tender: Tender; now: bigint }) {
  const reduce = useReducedMotion();
  const phase = phaseAt(now, tender);
  const index = STEPS.findIndex((s) => s.phase === phase);
  const settled = tender.status !== 'open';
  const next = nextBoundary(now, tender);
  return (
    <div className="surface p-5">
      <ol className="grid gap-3 sm:grid-cols-4" aria-label="Tender phase">
        {STEPS.map((s, i) => {
          const active = !settled && i === index;
          const past = settled || i < index;
          return (
            <li key={s.phase} aria-current={active ? 'step' : undefined} className="relative">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={false}
                  animate={{ width: past ? '100%' : active ? '100%' : '0%', opacity: active ? 1 : past ? 0.55 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.5 }}
                />
              </div>
              <p className={`mt-2 text-sm font-medium ${active ? 'text-accent' : past ? 'text-text' : 'text-muted'}`}>{PHASE_LABEL[s.phase]}</p>
              <p className="text-xs text-muted">{s.hint}</p>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-sm">
        {settled ? (
          <Badge tone={tender.status === 'finalized' ? 'success' : 'neutral'}>{tender.status === 'finalized' ? 'Settled' : 'Cancelled'}</Badge>
        ) : next ? (
          <>
            <span>
              {next.label} in <strong className="mono text-base">{formatDuration(next.at - now)}</strong>
            </span>
            <span className="text-muted">at {formatUnix(next.at).local}</span>
          </>
        ) : (
          <span>The screening window has ended. Finalization is open to anyone.</span>
        )}
        <span className="text-xs text-muted">Countdown uses your device clock, which may differ from chain time.</span>
      </div>
    </div>
  );
}

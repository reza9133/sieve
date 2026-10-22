import { useState } from 'react'
import { LifecycleScene, type LifecycleStage } from '@/scenes/LifecycleScene'

export function HowItWorks() {
  const [activeStage, setActiveStage] = useState<LifecycleStage>('open')

  const stages: {
    id: LifecycleStage
    title: string
    window: string
    description: string
  }[] = [
    {
      id: 'open',
      title: '1. Funder Opens Tender',
      window: 'Instant',
      description:
        'The funder deposits credit, enters tender specifications (1-8 requirements), links a requirements document by exact SHA-256 hash, and locks the budget.',
    },
    {
      id: 'bidding',
      title: '2. Sealed Bidding Window',
      window: 'Until commit_by',
      description:
        'Bidders post a bond from credit and submit a cryptographic commitment to their price, proposal URL, hash, and salt. Prices remain completely secret.',
    },
    {
      id: 'reveal',
      title: '3. Reveal Window',
      window: 'commit_by .. reveal_by',
      description:
        'Bidders reveal their price, proposal URL, proposal SHA-256, and salt. The contract verifies the commitment length-prefixed hash. Unrevealed bonds forfeit to funder.',
    },
    {
      id: 'screening',
      title: '4. Validator Screening',
      window: 'reveal_by .. review_by (3 days)',
      description:
        'Validators fetch committed documents over HTTPS and run bounded classifications. If consensus agrees all requirements are met and confidence >= 80, the bid is compliant.',
    },
    {
      id: 'finalize',
      title: '5. Tender Finalization',
      window: 'After reveal_by / screening complete',
      description:
        'Anyone can finalize. Deterministic code selects the lowest-priced compliant bid (earliest index breaks ties). Unspent budget and price are credited.',
    },
    {
      id: 'withdraw',
      title: '6. Pull-Payment Withdrawal',
      window: 'Anytime',
      description:
        'Winner withdraws their price; funder withdraws unspent budget and forfeited bonds; bidders withdraw refunded bonds. Single value transfer per account.',
    },
  ]

  return (
    <div className="space-y-16 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">How Sieve Works</h1>
        <p className="text-text-muted max-w-2xl mx-auto text-base">
          A verifiable state machine coordinating funders, sealed bidders, and GenLayer validators with pull-payment settlement.
        </p>
      </div>

      {/* Interactive Lifecycle Stage */}
      <section className="card p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-bold">Interactive Lifecycle Walkthrough</h2>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5 space-y-2">
            {stages.map((stage) => {
              const isSelected = activeStage === stage.id
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setActiveStage(stage.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/10 shadow-sm'
                      : 'border-border bg-surface hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-bold ${isSelected ? 'text-accent' : 'text-text'}`}>
                      {stage.title}
                    </span>
                    <span className="text-[11px] font-mono text-text-muted bg-surface-2 px-2 py-0.5 rounded">
                      {stage.window}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">{stage.description}</p>
                </button>
              )
            })}
          </div>

          <div className="lg:col-span-7 flex flex-col items-center">
            <LifecycleScene stage={activeStage} />
            <p className="text-xs text-text-muted text-center mt-3 font-mono">
              Stage: <span className="text-accent uppercase font-semibold">{activeStage}</span> • Real-time visual representation
            </p>
          </div>
        </div>
      </section>

      {/* Time-Window Diagram */}
      <section className="card p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-bold">Time Window Architecture</h2>
        <div className="p-4 rounded-xl bg-surface-2 border border-border font-mono text-xs overflow-x-auto space-y-2">
          <p className="text-accent font-semibold">open_tender ........ commit_by .......... reveal_by ............... review_by (reveal + 3d)</p>
          <p className="text-text-muted">
            {'[   Bidding Window   ]  |  [ Reveal Window ]  |  [   Screening Window (3d)   ]  |  [ Finalize Allowed ]'}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-text-muted">
          <div className="p-4 rounded-lg bg-surface border border-border">
            <p className="font-bold text-text mb-1">Bidding Window</p>
            <p>From creation to commit_by. Commit sealed bids or withdraw bid + bond. Min duration 120s.</p>
          </div>
          <div className="p-4 rounded-lg bg-surface border border-border">
            <p className="font-bold text-text mb-1">Reveal Window</p>
            <p>From commit_by to reveal_by. Bidders submit salt and price. Missing this forfeits bond.</p>
          </div>
          <div className="p-4 rounded-lg bg-surface border border-border">
            <p className="font-bold text-text mb-1">Screening Window</p>
            <p>From reveal_by to review_by (fixed 3 days). Validators execute consensus classification.</p>
          </div>
        </div>
      </section>

      {/* Money Flow Table */}
      <section className="card p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-bold">Settlement & Money Flow Matrix</h2>
        <p className="text-sm text-text-muted">
          All settlement is internal bookkeeping on a pull-payment ledger. <code>finalize_tender</code> emits no transfers.
        </p>
        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-surface-2 border-b border-border text-text-muted uppercase text-[11px] font-semibold">
              <tr>
                <th className="p-3 sm:p-4">Event / Scenario</th>
                <th className="p-3 sm:p-4">Winner Effect</th>
                <th className="p-3 sm:p-4">Funder Effect</th>
                <th className="p-3 sm:p-4">Bond Treatment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-text">Winner Determined</td>
                <td className="p-3 sm:p-4 text-success font-medium">Credited sealed price</td>
                <td className="p-3 sm:p-4">Credited budget - price</td>
                <td className="p-3 sm:p-4 text-success">Refunded to bidder</td>
              </tr>
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-text">No Compliant Bid</td>
                <td className="p-3 sm:p-4 text-text-muted">—</td>
                <td className="p-3 sm:p-4">Credited full budget</td>
                <td className="p-3 sm:p-4 text-success">Refunded to bidders</td>
              </tr>
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-text">Bid Never Revealed</td>
                <td className="p-3 sm:p-4 text-text-muted">—</td>
                <td className="p-3 sm:p-4 text-accent font-medium">Collects forfeited bond</td>
                <td className="p-3 sm:p-4 text-danger font-semibold">Forfeited</td>
              </tr>
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-text">Disqualified (Proposal Fault)</td>
                <td className="p-3 sm:p-4 text-text-muted">—</td>
                <td className="p-3 sm:p-4 text-accent font-medium">Collects forfeited bond</td>
                <td className="p-3 sm:p-4 text-danger font-semibold">Forfeited</td>
              </tr>
              <tr>
                <td className="p-3 sm:p-4 font-semibold text-text">Withdrawn Before commit_by</td>
                <td className="p-3 sm:p-4 text-text-muted">—</td>
                <td className="p-3 sm:p-4 text-text-muted">—</td>
                <td className="p-3 sm:p-4 text-success font-medium">Refunded to bidder</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Screening Rules Summary */}
      <section className="card p-6 sm:p-8 space-y-4">
        <h2 className="text-xl font-bold">Screening & Equivalence Rules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm text-text-muted">
          <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
            <h3 className="font-bold text-text">Deterministic Boundaries</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Documents fetched strictly via HTTPS with exact SHA-256 byte verification.</li>
              <li>30,000 byte limit, strict UTF-8 decoding required.</li>
              <li>Quoted data is fenced and delimiters neutralised to prevent prompt injection.</li>
              <li>First decisive consensus verdict is final and immutable.</li>
            </ul>
          </div>
          <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
            <h3 className="font-bold text-text">Validator Equivalence</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Confidence &lt; 80 is treated as inconclusive (non-authorizing).</li>
              <li>Compliant requires 100% requirements met, no instruction attempt, confidence ≥ 80.</li>
              <li>Noncompliant requires agreement on exact failed requirements bitmask.</li>
              <li>Max 8 review calls and 3 semantic assessments per bid, cooldown doubling 60s to 1h.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

import { GENLAYER_DOCS_URL } from '@/chain/config'

export function Security() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-fade-in">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Security Boundaries & Known Limits</h1>
        <p className="text-text-muted text-sm max-w-2xl mx-auto">
          Sieve is an un-opinionated cryptoeconomic primitive. Read these architectural boundaries carefully before participating in any tender.
        </p>
      </div>

      <div className="space-y-6 text-sm text-text-muted leading-relaxed">
        {/* Boundary 1 */}
        <div className="card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-text font-bold text-base">
            <span className="w-2.5 h-2.5 rounded-full bg-accent" />
            <h2>1. SHA-256 Proves Byte Identity, Not Authorship or Truth</h2>
          </div>
          <p>
            The contract requires SHA-256 commitments over exact UTF-8 bytes fetched via HTTPS. While this guarantees that validators screen identical bits, it does not certify that the proposal is truthful, that the author owns the server, or that DNS records were not repointed after publication.
          </p>
        </div>

        {/* Boundary 2 */}
        <div className="card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-text font-bold text-base">
            <span className="w-2.5 h-2.5 rounded-full bg-warning" />
            <h2>2. Probabilistic Judgment & Decisive Finality</h2>
          </div>
          <p>
            Semantic judgment performed by LLM-backed validators is probabilistic. While validators must reproduce identical decisive consensus findings on definitively failed requirements (bitmask matching) to exclude a bidder, <strong>the first decisive consensus verdict is final and immutable</strong>. Re-rolling cannot flip a decisive verdict. Funders must write clear, numbered requirements and bidders must submit unambiguous proposals.
          </p>
        </div>

        {/* Boundary 3 */}
        <div className="card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-text font-bold text-base">
            <span className="w-2.5 h-2.5 rounded-full bg-danger" />
            <h2>3. Funder-Crowding & Collusion Limits</h2>
          </div>
          <p>
            The funder collects all forfeited bonds. Consequently, a malicious funder could occupy bid slots with throwaway addresses at the cost of gas and capital lockup, crowding out genuine bidders. Although slots are capped at 16 and a funder cannot bid directly on their own tender, Sybil bidding remains theoretically possible. <strong>Bidders should evaluate funder on-chain reputation before posting bonds.</strong>
          </p>
        </div>

        {/* Boundary 4 */}
        <div className="card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-text font-bold text-base">
            <span className="w-2.5 h-2.5 rounded-full bg-accent" />
            <h2>4. Slot-Holding & Griefing Vector</h2>
          </div>
          <p>
            Withdrawing a bid before <code>commit_by</code> frees the bidder's bond but does not release the allocated slot count. A bidder can thus consume a slot for the duration of the bidding window. Furthermore, an unreachable proposal URL produces a retryable non-authorizing failure rather than immediate bond forfeiture, allowing a throwaway bidder to hold a slot until the screening deadline (<code>review_by</code>).
          </p>
        </div>

        {/* Boundary 5 */}
        <div className="card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-text font-bold text-base">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-2" />
            <h2>5. Pull-Payment Transfers & Downstream Receipts</h2>
          </div>
          <p>
            <code>withdraw_credit</code> issues a single native value transfer. Due to smart execution isolation, the intelligent contract cannot verify receipt inside a downstream contract. Users should verify parent transaction receipts and balance changes on the explorer. Review the{' '}
            <a
              href={`${GENLAYER_DOCS_URL}/developers/intelligent-contracts/features/value-transfers`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline font-medium"
            >
              GenLayer Value-Transfer Documentation ↗
            </a>.
          </p>
        </div>

        {/* Boundary 6 */}
        <div className="card p-6 sm:p-8 space-y-3 bg-surface-2">
          <div className="flex items-center gap-2 text-text font-bold text-base">
            <span className="w-2.5 h-2.5 rounded-full bg-text-muted" />
            <h2>6. No Legal Warranty or Delivery Enforcement</h2>
          </div>
          <p>
            Sieve awards and credits the lowest compliant price upon finalization. It does not monitor work progress, milestones, delivery, or dispute resolution. Anyone requiring delivery assurances must implement escrow covenants or multi-sig arbitration layers on top of Sieve.
          </p>
        </div>
      </div>
    </div>
  )
}

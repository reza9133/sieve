import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeroScene } from '@/scenes/HeroScene'
import { fetchContractInfo, fetchAccounting } from '@/chain/sieveClient'
import type { ContractInfoData, AccountingData } from '@/chain/types'
import { formatGENCompact } from '@/lib/units'
import { useWallet } from '@/wallet/WalletProvider'

export function Home() {
  const { isDemoMode } = useWallet()
  const [info, setInfo] = useState<ContractInfoData | null>(null)
  const [accounting, setAccounting] = useState<AccountingData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    if (isDemoMode) {
      setInfo({
        name: 'Sieve',
        version: '0.1.0',
        minBudgetWei: 1000000000000000n,
        minBondWei: 100000000000000n,
        maxRequirements: 8,
        maxBidsLimit: 16,
        minimumConfidence: 80,
        minWindowSeconds: 120,
        reviewWindowSeconds: 259200,
        maxReviewCallsPerBid: 8,
        maxSemanticAssessmentsPerBid: 3,
        retryCooldownSeconds: 60,
        maxRetryCooldownSeconds: 3600,
        commitmentScheme: 'sha256 over length-prefixed fields',
        rankingRule: 'lowest compliant price',
        settlementModel: 'internal pull-payment',
        forfeiturePolicy: 'forfeited only for missing reveal or irreproducible bytes',
        decisiveVerdictPolicy: 'first decisive consensus verdict is final',
      })
      setAccounting({
        totalCredits: 5000000000000000000n,
        totalLockedBudgets: 12000000000000000000n,
        totalLockedBonds: 800000000000000000n,
        accountedLiabilities: 17800000000000000000n,
        contractBalance: 17800000000000000000n,
        unallocatedBalance: 0n,
        balanceShortfall: 0n,
        solvent: true,
      })
      setLoading(false)
      return
    }

    Promise.all([fetchContractInfo(), fetchAccounting()])
      .then(([infoData, accData]) => {
        if (!mounted) return
        setInfo(infoData)
        setAccounting(accData)
        setLoading(false)
      })
      .catch((err) => {
        console.warn('Failed to load contract stats, using fallback:', err)
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [isDemoMode])

  return (
    <div className="space-y-16 animate-fade-in">
      {/* Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center pt-4">
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs font-semibold">
            <span>GenLayer Intelligent Contract</span>
            <span>•</span>
            <span>v0.1.0 on Studionet</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
            Sealed-bid reverse auctions where validators screen compliance and deterministic code picks the lowest price.
          </h1>

          <p className="text-base sm:text-lg text-text-muted max-w-xl">
            A funder commits requirements by SHA-256 and escrows a budget. Bidders submit sealed commitments and bonds. GenLayer validators independently verify compliance against the committed bytes.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link to="/tender/new" className="btn btn-primary px-6 py-3 text-sm font-semibold">
              Open a tender
            </Link>
            <Link to="/explore" className="btn btn-secondary px-6 py-3 text-sm font-semibold">
              Find a tender
            </Link>
          </div>
        </div>

        {/* 3D Scene */}
        <div className="lg:col-span-5">
          <HeroScene />
        </div>
      </section>

      {/* Live Contract Strip */}
      <section className="p-4 sm:p-6 rounded-2xl bg-surface border border-border shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
            <h2 className="text-sm font-bold tracking-wide uppercase text-text-muted">Live Contract State</h2>
          </div>
          {accounting && (
            <span
              className={`badge ${
                accounting.solvent ? 'badge-success' : 'badge-danger'
              }`}
            >
              {accounting.solvent ? 'Solvent (Liabilities Verified)' : 'Solvency Warning'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4">
          <div>
            <p className="text-xs text-text-muted">Contract Version</p>
            <p className="text-lg font-mono font-bold text-text mt-0.5">
              {loading ? '…' : info?.version || '0.1.0'}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Min Budget</p>
            <p className="text-lg font-mono font-bold text-text mt-0.5">
              {loading ? '…' : formatGENCompact(info?.minBudgetWei || 1000000000000000n)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Min Bond</p>
            <p className="text-lg font-mono font-bold text-text mt-0.5">
              {loading ? '…' : formatGENCompact(info?.minBondWei || 100000000000000n)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Locked Escrows</p>
            <p className="text-lg font-mono font-bold text-accent mt-0.5">
              {loading
                ? '…'
                : formatGENCompact(
                    (accounting?.totalLockedBudgets || 0n) + (accounting?.totalLockedBonds || 0n)
                  )}
            </p>
          </div>
        </div>
      </section>

      {/* 3 Core Value Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card hover:border-accent/40 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold mb-2">Sealed Bids</h3>
          <p className="text-sm text-text-muted leading-relaxed">
            Prices are kept strictly confidential client-side via length-prefixed SHA-256 commitments. Front-running and boundary-shifting are mathematically impossible.
          </p>
        </div>

        <div className="card hover:border-accent/40 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-success/10 text-success flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold mb-2">Validator-Screened</h3>
          <p className="text-sm text-text-muted leading-relaxed">
            Validators fetch the committed requirements and proposal over HTTPS. Bounded classifications verify each requirement as met, not_met, or unclear with consensus.
          </p>
        </div>

        <div className="card hover:border-accent/40 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-accent-2/10 text-accent-2 flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold mb-2">Pull-Payment Settlement</h3>
          <p className="text-sm text-text-muted leading-relaxed">
            Finalization emits no external transfers. All funds settle to internal credit ledgers, eliminating partial-failure cascades and multi-recipient reentrancy.
          </p>
        </div>
      </section>

      {/* Why GenLayer Section */}
      <section className="card p-8 bg-surface-2 border-border space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Why GenLayer?</h2>
        <p className="text-text-muted text-sm sm:text-base leading-relaxed">
          A deterministic smart contract can enforce commitments, deadlines, and payouts, but it cannot read two documents and decide whether a free-text proposal really offers a 5-year warranty. A single off-chain screener could quietly exclude the cheapest bidder.
        </p>
        <p className="text-text-muted text-sm sm:text-base leading-relaxed">
          Sieve asks several GenLayer validators to fetch the same hash-committed bytes and independently produce a bounded classification. The Equivalence Principle only lets a result stand when validators reproduce the same decisive findings. Free-form rationale is stored for transparency but never compared and never authorizes anything.
        </p>
      </section>
    </div>
  )
}

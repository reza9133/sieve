import React, { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useWallet } from '@/wallet/WalletProvider'
import {
  fetchTender,
  fetchBidders,
  fetchBid,
  fetchRanking,
  executeCancelTender,
  executeWithdrawBid,
  executeReviewBid,
  executeFinalizeTender,
} from '@/chain/sieveClient'
import type { TenderData, BidData, RankingData } from '@/chain/types'
import { formatGEN, shortenAddress } from '@/lib/units'
import { deriveTenderPhase, formatDateTime, formatCountdown } from '@/lib/time'
import { decodeFailedMask } from '@/lib/validation'
import { CopyButton } from '@/components/ui/CopyButton'
import { SkeletonCard } from '@/components/ui/LoadingSkeleton'
import { recordActivity } from '@/lib/storage'
import { parseContractError } from '@/chain/errors'
import { explorerTxUrl } from '@/chain/config'

export function TenderDetail() {
  const { funder: routeFunder, id: routeId } = useParams<{ funder: string; id: string }>()
  const { account, activeProvider, isWrongNetwork, isDemoMode } = useWallet()

  const funder = (routeFunder || '').toLowerCase()
  const tenderId = routeId || ''

  const [tender, setTender] = useState<TenderData | null>(null)
  const [bids, setBids] = useState<BidData[]>([])
  const [ranking, setRanking] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'bids' | 'ranking' | 'settlement'>('overview')

  // Action status
  const [actionLoading, setActionLoading] = useState(false)
  const [actionTx, setActionTx] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!funder || !tenderId) return

    if (isDemoMode) {
      const demoNow = BigInt(Math.floor(Date.now() / 1000))
      const demoTender: TenderData = {
        tenderId,
        funder,
        title: 'Demo Tender: Decentralized AI Model Screening',
        summary: 'Demo tender displaying mock data on Studionet.',
        requirementsUrl: 'https://example.com/demo-requirements.md',
        requirementsHash: '0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19',
        requirementCount: 3,
        budgetWei: 5000000000000000000n, // 5 GEN
        bondWei: 200000000000000000n, // 0.2 GEN
        maxBids: 8,
        bidCount: 2,
        createdAt: demoNow - 3600n,
        commitBy: demoNow + 1800n,
        revealBy: demoNow + 3600n,
        reviewBy: demoNow + 259200n,
        status: 'open',
        settlement: '',
        winner: '',
        awardPrice: 0n,
        forfeitedWei: 0n,
        refundedWei: 0n,
      }
      const demoBids: BidData[] = [
        {
          bidder: '0x1234567890123456789012345678901234567890',
          index: 0,
          commitment: '0xab8d116e4a3d62a3d9058ee7424eb2a613b7152418af8350b6d6b9f4a3e19466',
          status: 'revealed',
          outcome: '',
          price: 3500000000000000000n,
          proposalUrl: 'https://example.com/proposal1.md',
          proposalHash: '0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19',
          committedAt: demoNow - 3000n,
          revealedAt: demoNow - 1000n,
          bondWei: 200000000000000000n,
          reviewCalls: 1,
          attempts: 1,
          retryAt: 0n,
          confidence: 95,
          failedMask: 0,
          instructionAttempt: 'no',
          rationale: 'All requirements met unambiguously.',
          reason: '',
        },
      ]
      setTender(demoTender)
      setBids(demoBids)
      setRanking({ entries: [{ bidder: demoBids[0].bidder, price: demoBids[0].price, index: 0 }] })
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const tenderData = await fetchTender(funder, tenderId)
      setTender(tenderData)

      // Record activity in local storage
      recordActivity({
        funderAddress: funder,
        tenderId,
        title: tenderData.title,
        role: account && account === funder ? 'funder' : 'viewer',
        pinned: false,
        lastInteractedAt: Date.now(),
      })

      // Fetch bidders list
      const biddersData = await fetchBidders(funder, tenderId)
      const bidList: BidData[] = []

      // Bounded fetch
      for (const bAddress of biddersData.bidders) {
        try {
          const b = await fetchBid(funder, tenderId, bAddress)
          bidList.push(b)
        } catch {}
      }
      setBids(bidList)

      // Fetch ranking
      try {
        const rankingData = await fetchRanking(funder, tenderId)
        setRanking(rankingData)
      } catch {}

      setError(null)
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to fetch tender')
    } finally {
      setLoading(false)
    }
  }, [funder, tenderId, account, isDemoMode])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (error || !tender) {
    return (
      <div className="card p-8 max-w-2xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold">Tender Not Found</h2>
        <p className="text-sm text-text-muted">{error || 'Could not locate tender with the provided address and ID.'}</p>
        <Link to="/explore" className="btn btn-primary inline-flex">
          Back to Explore
        </Link>
      </div>
    )
  }

  // Derive phase
  const hasOpenScreeningBids = bids.some(
    (b) => b.status === 'revealed' && b.reviewCalls < 8 && b.attempts < 3
  )
  const phaseInfo = deriveTenderPhase(
    tender.status,
    tender.commitBy,
    tender.revealBy,
    tender.reviewBy,
    hasOpenScreeningBids
  )

  // Roles
  const isFunder = account && account.toLowerCase() === tender.funder.toLowerCase()
  const myBid = account ? bids.find((b) => b.bidder.toLowerCase() === account.toLowerCase()) : null
  const isBidder = Boolean(myBid)

  // Handlers for role actions
  const handleCancelTender = async () => {
    if (!activeProvider || !account) return
    setActionLoading(true)
    setActionError(null)
    try {
      const tx = await executeCancelTender(activeProvider.provider, account, tender.tenderId)
      setActionTx(tx)
      setActionMsg('Tender cancellation submitted (~40s finalization).')
      setTimeout(loadData, 40000)
    } catch (err) {
      const parsed = parseContractError(err)
      setActionError(parsed.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleWithdrawBid = async () => {
    if (!activeProvider || !account) return
    setActionLoading(true)
    setActionError(null)
    try {
      const tx = await executeWithdrawBid(activeProvider.provider, account, {
        funderText: tender.funder,
        tenderId: tender.tenderId,
      })
      setActionTx(tx)
      setActionMsg('Bid withdrawal submitted. Bond will be refunded to your credit.')
      setTimeout(loadData, 40000)
    } catch (err) {
      const parsed = parseContractError(err)
      setActionError(parsed.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReviewBid = async (bidderAddress: string) => {
    if (!activeProvider || !account) return
    setActionLoading(true)
    setActionError(null)
    try {
      const tx = await executeReviewBid(activeProvider.provider, account, {
        funderText: tender.funder,
        tenderId: tender.tenderId,
        bidderText: bidderAddress,
      })
      setActionTx(tx)
      setActionMsg('Screening request submitted. GenLayer validators are fetching documents.')
      setTimeout(loadData, 40000)
    } catch (err) {
      const parsed = parseContractError(err)
      setActionError(parsed.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleFinalize = async () => {
    if (!activeProvider || !account) return
    setActionLoading(true)
    setActionError(null)
    try {
      const tx = await executeFinalizeTender(activeProvider.provider, account, {
        funderText: tender.funder,
        tenderId: tender.tenderId,
      })
      setActionTx(tx)
      setActionMsg('Finalization submitted. Settlement will credit internal balances.')
      setTimeout(loadData, 40000)
    } catch (err) {
      const parsed = parseContractError(err)
      setActionError(parsed.message)
    } finally {
      setActionLoading(false)
    }
  }

  const shareUrl = window.location.href

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-fade-in">
      {/* Top Header Card */}
      <div className="card p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className={`badge ${tender.status === 'open' ? 'badge-success' : 'badge-muted'} uppercase`}>
                {tender.status}
              </span>
              <span className="badge badge-accent uppercase font-mono">{phaseInfo.label}</span>
              {isFunder && <span className="badge badge-warning">You are the Funder</span>}
              {isBidder && <span className="badge badge-accent">You are a Bidder</span>}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text">{tender.title}</h1>
            <p className="text-xs text-text-muted font-mono">
              ID: {tender.tenderId} • Funder: {shortenAddress(tender.funder)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <CopyButton text={shareUrl} label="Share Tender" />
            <Link
              to={`/tender/${tender.funder}/${tender.tenderId}/bid`}
              className="btn btn-primary text-xs py-2 px-4"
            >
              Bid / Reveal
            </Link>
          </div>
        </div>

        {/* Phase Stepper Bar */}
        <div className="pt-4 border-t border-border space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-text">Phase: {phaseInfo.label}</span>
            {phaseInfo.nextBoundarySec && (
              <span className="font-mono text-accent">
                Next deadline in: {formatCountdown(phaseInfo.nextBoundarySec)}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted">{phaseInfo.description}</p>
        </div>
      </div>

      {/* Action Banners */}
      {actionMsg && (
        <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-accent text-xs flex justify-between items-center">
          <span>{actionMsg}</span>
          {actionTx && (
            <a href={explorerTxUrl(actionTx)} target="_blank" rel="noopener noreferrer" className="underline">
              View on Explorer ↗
            </a>
          )}
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-medium">
          {actionError}
        </div>
      )}

      {/* Role-Aware Actions Strip */}
      <div className="card p-4 sm:p-6 bg-surface-2 border-border flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold">Actions Available for Your Role</h3>
          <p className="text-xs text-text-muted">
            Actions are automatically enabled or disabled based on role, deadline phase, and cooldowns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Funder cancel */}
          {isFunder && (
            <button
              type="button"
              disabled={actionLoading || isWrongNetwork || tender.bidCount > 0 || tender.status !== 'open'}
              onClick={handleCancelTender}
              className="btn btn-danger text-xs py-1.5"
              title={
                tender.bidCount > 0
                  ? 'Cannot cancel: sealed bids have already been committed.'
                  : 'Cancel tender and refund locked budget.'
              }
            >
              Cancel Tender
            </button>
          )}

          {/* Bidder withdraw */}
          {isBidder && myBid?.status === 'committed' && (
            <button
              type="button"
              disabled={actionLoading || isWrongNetwork || !phaseInfo.canWithdrawBid}
              onClick={handleWithdrawBid}
              className="btn btn-secondary text-xs py-1.5"
              title={
                !phaseInfo.canWithdrawBid
                  ? 'Withdrawal is only permitted before commit_by deadline.'
                  : 'Withdraw sealed bid and refund bond.'
              }
            >
              Withdraw My Bid
            </button>
          )}

          {/* Anyone finalize */}
          <button
            type="button"
            disabled={actionLoading || isWrongNetwork || !phaseInfo.canFinalize || tender.status !== 'open'}
            onClick={handleFinalize}
            className="btn btn-primary text-xs py-1.5"
            title={
              !phaseInfo.canFinalize
                ? 'Finalization is locked until reveal_by closes and all bids are screened, or review_by is reached.'
                : 'Permissionlessly settle tender to lowest compliant bidder.'
            }
          >
            Finalize Tender
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-4">
        {(['overview', 'bids', 'ranking', 'settlement'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={`pb-3 text-sm font-semibold capitalize border-b-2 transition-colors ${
              activeTab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {t} {t === 'bids' ? `(${tender.bidCount})` : ''}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}

      {/* 1. OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6 space-y-4">
            <h3 className="text-base font-bold">Tender Economics</h3>
            <div className="divide-y divide-border text-sm">
              <div className="py-2.5 flex justify-between">
                <span className="text-text-muted">Total Budget Escrowed:</span>
                <span className="font-mono font-bold text-accent">{formatGEN(tender.budgetWei)}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-text-muted">Bidder Bond Required:</span>
                <span className="font-mono">{formatGEN(tender.bondWei)}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-text-muted">Bid Capacity / Committed:</span>
                <span className="font-mono">{tender.bidCount} / {tender.maxBids} slots</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-text-muted">Mandatory Clauses:</span>
                <span>{tender.requirementCount} numbered requirements</span>
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <h3 className="text-base font-bold">Requirements Document</h3>
            <div className="space-y-3 text-xs">
              <div>
                <p className="text-text-muted mb-1">Document URL:</p>
                <a
                  href={tender.requirementsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-accent hover:underline break-all"
                >
                  {tender.requirementsUrl} ↗
                </a>
              </div>
              <div>
                <p className="text-text-muted mb-1">Committed SHA-256 Hash:</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono break-all bg-surface-2 p-1.5 rounded">{tender.requirementsHash}</span>
                  <CopyButton text={tender.requirementsHash} />
                </div>
              </div>
              <div>
                <p className="text-text-muted mb-1">Summary:</p>
                <p className="text-text bg-surface-2 p-3 rounded-lg leading-relaxed">{tender.summary}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. BIDS */}
      {activeTab === 'bids' && (
        <div className="card p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold">Committed Bids ({bids.length})</h3>
            <Link
              to={`/tender/${tender.funder}/${tender.tenderId}/bid`}
              className="btn btn-secondary text-xs py-1"
            >
              Submit Sealed Bid
            </Link>
          </div>

          {bids.length > 0 ? (
            <div className="divide-y divide-border">
              {bids.map((b) => {
                const isMyBid = account && account.toLowerCase() === b.bidder.toLowerCase()
                const canScreenBid =
                  (isFunder || isMyBid) &&
                  phaseInfo.canScreen &&
                  b.status === 'revealed' &&
                  b.reviewCalls < 8 &&
                  b.attempts < 3
                const failedReqs = decodeFailedMask(b.failedMask, tender.requirementCount)

                return (
                  <div key={b.bidder} className="py-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">{shortenAddress(b.bidder)}</span>
                        {isMyBid && <span className="badge badge-accent text-[10px]">Your Bid</span>}
                        <span
                          className={`badge ${
                            b.status === 'compliant'
                              ? 'badge-success'
                              : b.status === 'noncompliant' || b.status === 'disqualified'
                              ? 'badge-danger'
                              : 'badge-muted'
                          } text-[10px] uppercase font-mono`}
                        >
                          {b.status}
                        </span>
                        {b.outcome && (
                          <span className="badge badge-accent text-[10px] font-mono">{b.outcome}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold text-accent">
                          {b.revealedAt > 0n ? formatGEN(b.price) : '🔒 Sealed'}
                        </span>

                        {canScreenBid && (
                          <button
                            type="button"
                            disabled={actionLoading || isWrongNetwork}
                            onClick={() => handleReviewBid(b.bidder)}
                            className="btn btn-secondary text-xs py-1 px-3"
                          >
                            Screen with Validators
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bid Details & Screening Results */}
                    {b.revealedAt > 0n ? (
                      <div className="p-3 rounded-lg bg-surface-2 text-xs space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-text-muted">
                          <div>Confidence: <span className="font-mono text-text">{b.confidence}%</span></div>
                          <div>Calls: <span className="font-mono text-text">{b.reviewCalls}/8</span></div>
                          <div>Assessments: <span className="font-mono text-text">{b.attempts}/3</span></div>
                          <div>Prompt injection: <span className="font-mono text-text">{b.instructionAttempt || 'no'}</span></div>
                        </div>

                        {failedReqs.length > 0 && (
                          <p className="text-danger font-medium">
                            Failed Requirements (not_met): {failedReqs.map((r) => `R${r}`).join(', ')}
                          </p>
                        )}

                        {b.rationale && (
                          <p className="text-text-muted italic">
                            Validator Rationale: "{b.rationale}"
                          </p>
                        )}
                        {b.reason && <p className="text-danger">Diagnostic: {b.reason}</p>}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted font-mono">
                        Commitment: {shortenAddress(b.commitment, 10)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-center py-6 text-sm text-text-muted">No bids committed yet.</p>
          )}
        </div>
      )}

      {/* 3. RANKING */}
      {activeTab === 'ranking' && (
        <div className="card p-6 space-y-4">
          <h3 className="text-base font-bold">Deterministic Ranking Order</h3>
          <p className="text-xs text-text-muted">
            Compliant bids sorted by lowest sealed price. Earliest commitment index breaks ties deterministically.
          </p>

          {ranking && ranking.entries.length > 0 ? (
            <div className="divide-y divide-border">
              {ranking.entries.map((entry, idx) => (
                <div key={entry.bidder} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-accent/10 text-accent font-mono font-bold flex items-center justify-center text-xs">
                      #{idx + 1}
                    </span>
                    <span className="font-mono">{shortenAddress(entry.bidder)}</span>
                    <span className="text-xs text-text-muted">Slot #{entry.index}</span>
                  </div>
                  <span className="font-mono font-bold text-success">{formatGEN(entry.price)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-sm text-text-muted">
              No compliant bids ranked yet. Ranking activates once revealed bids are screened as compliant.
            </p>
          )}
        </div>
      )}

      {/* 4. SETTLEMENT */}
      {activeTab === 'settlement' && (
        <div className="card p-6 space-y-4">
          <h3 className="text-base font-bold">Settlement Details</h3>
          <div className="divide-y divide-border text-sm">
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Settlement Outcome:</span>
              <span className="font-mono font-semibold">{tender.settlement || 'Pending Finalization'}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Award Winner:</span>
              <span className="font-mono font-bold text-success">{tender.winner ? shortenAddress(tender.winner) : 'None'}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Award Price Paid:</span>
              <span className="font-mono font-bold text-accent">{formatGEN(tender.awardPrice)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Total Forfeited Bonds to Funder:</span>
              <span className="font-mono text-danger">{formatGEN(tender.forfeitedWei)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Total Refunded Wei:</span>
              <span className="font-mono text-success">{formatGEN(tender.refundedWei)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

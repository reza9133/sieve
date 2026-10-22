import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useWallet } from '@/wallet/WalletProvider'
import {
  fetchTender,
  fetchBid,
  fetchAvailableCredit,
  executeCommitBid,
  executeRevealBid,
} from '@/chain/sieveClient'
import type { TenderData, BidData } from '@/chain/types'
import {
  computeCommitment,
  generateSalt,
} from '@/lib/commitment'
import { hashDocumentFile } from '@/lib/hash'
import { parseGEN, formatGEN, shortenAddress } from '@/lib/units'
import {
  validateHttpsUrl,
  validateHash,
  validateSalt,
} from '@/lib/validation'
import { deriveTenderPhase, formatDateTime } from '@/lib/time'
import {
  saveRevealPackage,
  loadRevealPackage,
  type RevealPackage,
} from '@/lib/storage'
import { parseContractError } from '@/chain/errors'

export function BidWizard() {
  const { funder: routeFunder, id: routeId } = useParams<{ funder: string; id: string }>()
  const { account, activeProvider, isWrongNetwork, openWalletModal, isDemoMode } = useWallet()
  const navigate = useNavigate()

  const funder = (routeFunder || '').toLowerCase()
  const tenderId = routeId || ''

  const [tender, setTender] = useState<TenderData | null>(null)
  const [existingBid, setExistingBid] = useState<BidData | null>(null)
  const [availableCredit, setAvailableCredit] = useState<bigint>(0n)
  const [loading, setLoading] = useState(true)

  // Mode: commit vs reveal
  const [mode, setMode] = useState<'commit' | 'reveal'>('commit')

  // Form Fields
  const [priceGen, setPriceGen] = useState('')
  const [proposalUrl, setProposalUrl] = useState('')
  const [proposalHash, setProposalHash] = useState('')
  const [salt, setSalt] = useState(() => generateSalt())
  const [computedCommitment, setComputedCommitment] = useState<string>('')
  const [savedBackupChecked, setSavedBackupChecked] = useState(false)
  const [hashingWarning, setHashingWarning] = useState<string[]>([])

  // Submission Status
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<'idle' | 'signing' | 'submitted' | 'finalized' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null)

  // Initial load
  useEffect(() => {
    if (!funder || !tenderId) return

    if (isDemoMode) {
      const demoTender: TenderData = {
        tenderId,
        funder,
        title: 'Demo Tender',
        summary: 'Demo bidding',
        requirementsUrl: 'https://example.com/req.md',
        requirementsHash: '0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19',
        requirementCount: 3,
        budgetWei: 5000000000000000000n,
        bondWei: 200000000000000000n,
        maxBids: 8,
        bidCount: 1,
        createdAt: 0n,
        commitBy: BigInt(Math.floor(Date.now() / 1000) + 3600),
        revealBy: BigInt(Math.floor(Date.now() / 1000) + 7200),
        reviewBy: BigInt(Math.floor(Date.now() / 1000) + 259200),
        status: 'open',
        settlement: '',
        winner: '',
        awardPrice: 0n,
        forfeitedWei: 0n,
        refundedWei: 0n,
      }
      setTender(demoTender)
      setAvailableCredit(1000000000000000000n)
      setLoading(false)
      return
    }

    Promise.all([
      fetchTender(funder, tenderId),
      account ? fetchAvailableCredit(account) : Promise.resolve(0n),
      account ? fetchBid(funder, tenderId, account).catch(() => null) : Promise.resolve(null),
    ])
      .then(([tData, credit, bData]) => {
        setTender(tData)
        setAvailableCredit(credit)
        setExistingBid(bData)

        // Automatically set mode based on bid existence and phase
        if (bData && bData.status === 'committed') {
          setMode('reveal')
          // Auto load saved reveal package
          const savedPkg = loadRevealPackage(funder, tenderId, bData.bidder)
          if (savedPkg) {
            setProposalUrl(savedPkg.proposalUrl)
            setProposalHash(savedPkg.proposalHash)
            setSalt(savedPkg.salt)
            setPriceGen((BigInt(savedPkg.priceWei) / 1000000000000000000n).toString())
          }
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load tender for bidding:', err)
        setLoading(false)
      })
  }, [funder, tenderId, account, isDemoMode])

  // Recalculate commitment whenever inputs change
  useEffect(() => {
    if (!account || !funder || !tenderId) return

    let priceWei = 0n
    try {
      priceWei = parseGEN(priceGen)
    } catch {
      setComputedCommitment('')
      return
    }

    if (
      !validateHttpsUrl(proposalUrl).valid ||
      !validateHash(proposalHash).valid ||
      !validateSalt(salt).valid
    ) {
      setComputedCommitment('')
      return
    }

    computeCommitment({
      funderAddress: funder,
      tenderId,
      bidderAddress: account,
      priceWei,
      proposalUrl,
      proposalHash,
      salt,
    }).then((c) => setComputedCommitment(c))
  }, [funder, tenderId, account, priceGen, proposalUrl, proposalHash, salt])

  // File upload hashing for proposal
  const handleProposalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await hashDocumentFile(file)
      setProposalHash(res.hash)
      setHashingWarning(res.warnings)
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to hash proposal file')
    }
  }

  // Backup reveal JSON download
  const handleDownloadBackup = () => {
    if (!account) return
    let priceWei = 0n
    try {
      priceWei = parseGEN(priceGen)
    } catch { /* ignore */ }

    const pkg: RevealPackage = {
      version: 1,
      funderAddress: funder,
      tenderId,
      bidderAddress: account,
      priceWei: priceWei.toString(),
      proposalUrl,
      proposalHash,
      salt,
      commitment: computedCommitment,
      savedAt: Date.now(),
    }

    // Save to local storage
    saveRevealPackage(pkg)

    // Trigger file download
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sieve-bid-backup-${tenderId}-${shortenAddress(account, 4)}.json`
    a.click()
    URL.revokeObjectURL(url)

    setSavedBackupChecked(true)
  }

  // Import backup JSON
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string
        const parsed = JSON.parse(text) as RevealPackage
        if (parsed.version === 1) {
          setProposalUrl(parsed.proposalUrl)
          setProposalHash(parsed.proposalHash)
          setSalt(parsed.salt)
          const pGen = (BigInt(parsed.priceWei) / 1000000000000000000n).toString()
          setPriceGen(pGen)
        }
      } catch {
        alert('Invalid reveal backup JSON')
      }
    }
    reader.readAsText(file)
  }

  if (loading || !tender) {
    return <div className="card p-8 text-center text-text-muted">Loading tender details…</div>
  }

  const phaseInfo = deriveTenderPhase(
    tender.status,
    tender.commitBy,
    tender.revealBy,
    tender.reviewBy
  )

  let priceWei = 0n
  try {
    priceWei = parseGEN(priceGen)
  } catch { /* ignore */ }

  const hasEnoughBond = availableCredit >= tender.bondWei
  const isPriceValid = priceWei > 0n && priceWei <= tender.budgetWei
  const isCommitFormValid =
    isPriceValid &&
    validateHttpsUrl(proposalUrl).valid &&
    validateHash(proposalHash).valid &&
    validateSalt(salt).valid &&
    computedCommitment.length === 66 &&
    savedBackupChecked &&
    hasEnoughBond

  // Commit handler
  const handleCommitBid = async () => {
    if (!account || !activeProvider) {
      openWalletModal()
      return
    }

    setIsSubmitting(true)
    setTxStatus('signing')
    setSubmitError(null)

    // Ensure package is persisted locally before sending tx
    const pkg: RevealPackage = {
      version: 1,
      funderAddress: funder,
      tenderId,
      bidderAddress: account,
      priceWei: priceWei.toString(),
      proposalUrl,
      proposalHash,
      salt,
      commitment: computedCommitment,
      savedAt: Date.now(),
    }
    saveRevealPackage(pkg)

    try {
      if (isDemoMode) {
        setTxHash('0xdemo_commit_tx_hash_1234567890abcdef')
        setTxStatus('submitted')
        setTimeout(() => setTxStatus('finalized'), 1500)
        return
      }

      const tx = await executeCommitBid(activeProvider.provider, account, {
        funderText: funder,
        tenderId,
        commitmentText: computedCommitment,
      })

      setTxHash(tx)
      setTxStatus('submitted')
      setTimeout(() => setTxStatus('finalized'), 40000)
    } catch (err) {
      const parsed = parseContractError(err)
      setSubmitError({ title: parsed.title, message: parsed.message })
      setTxStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reveal handler
  const handleRevealBid = async () => {
    if (!account || !activeProvider || !existingBid) return

    // Recompute and verify locally
    if (computedCommitment.toLowerCase() !== existingBid.commitment.toLowerCase()) {
      alert('Verification Error: Computed commitment does NOT match the sealed on-chain commitment!')
      return
    }

    setIsSubmitting(true)
    setTxStatus('signing')
    setSubmitError(null)

    try {
      if (isDemoMode) {
        setTxHash('0xdemo_reveal_tx_hash_1234567890abcdef')
        setTxStatus('submitted')
        setTimeout(() => setTxStatus('finalized'), 1500)
        return
      }

      const tx = await executeRevealBid(activeProvider.provider, account, {
        funderText: funder,
        tenderId,
        priceWei,
        proposalUrlText: proposalUrl,
        proposalHashText: proposalHash,
        saltText: salt,
      })

      setTxHash(tx)
      setTxStatus('submitted')
      setTimeout(() => setTxStatus('finalized'), 40000)
    } catch (err) {
      const parsed = parseContractError(err)
      setSubmitError({ title: parsed.title, message: parsed.message })
      setTxStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-2">
        <Link to={`/tender/${funder}/${tenderId}`} className="text-xs text-accent hover:underline flex items-center gap-1">
          ← Back to Tender Dashboard
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Bid & Reveal Portal</h1>
        <p className="text-text-muted text-sm font-mono">
          Tender: {tender.title} ({tender.tenderId})
        </p>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-2 border border-border">
        <button
          type="button"
          onClick={() => setMode('commit')}
          className={`py-2 text-sm font-semibold rounded-lg transition-colors ${
            mode === 'commit' ? 'bg-surface text-accent shadow-sm' : 'text-text-muted hover:text-text'
          }`}
        >
          1. Submit Sealed Bid
        </button>
        <button
          type="button"
          onClick={() => setMode('reveal')}
          className={`py-2 text-sm font-semibold rounded-lg transition-colors ${
            mode === 'reveal' ? 'bg-surface text-accent shadow-sm' : 'text-text-muted hover:text-text'
          }`}
        >
          2. Reveal Sealed Bid
        </button>
      </div>

      {/* Warning Box */}
      <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs space-y-1">
        <p className="font-bold">Important Forfeiture Policy</p>
        <p>
          Bids are sealed until the bidding window closes (<code>commit_by</code>: {formatDateTime(tender.commitBy)}). You MUST reveal your bid during the reveal window (ending <code>reveal_by</code>: {formatDateTime(tender.revealBy)}). <strong>If you fail to reveal or lose your salt/price/URL, your bond of {formatGEN(tender.bondWei)} will be permanently forfeited to the funder!</strong>
        </p>
      </div>

      {/* MODE 1: COMMIT BID */}
      {mode === 'commit' && (
        <div className="card p-6 sm:p-8 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-border">
            <div>
              <h2 className="text-xl font-bold">Commit Sealed Bid</h2>
              <p className="text-xs text-text-muted">Compute client-side commitment and lock required bond</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-text-muted">Bond Required:</span>
              <p className="font-mono font-bold text-accent">{formatGEN(tender.bondWei)}</p>
            </div>
          </div>

          {/* Credit Check */}
          <div className="p-3 rounded-lg bg-surface-2 border border-border flex items-center justify-between text-xs">
            <span>Your Available Credit: <strong className="font-mono text-accent">{formatGEN(availableCredit)}</strong></span>
            {!hasEnoughBond && (
              <Link to="/wallet" className="text-accent underline font-medium">
                Deposit Credit to Cover Bond ↗
              </Link>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Your Sealed Price Offer (GEN)</label>
              <input
                type="text"
                placeholder="e.g. 0.005"
                value={priceGen}
                onChange={(e) => setPriceGen(e.target.value)}
                className="input font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                Must be positive and less than or equal to tender budget ({formatGEN(tender.budgetWei)}).
              </p>
            </div>

            <div>
              <label className="label">Proposal Document URL (HTTPS)</label>
              <input
                type="url"
                placeholder="https://example.com/my-proposal.md"
                value={proposalUrl}
                onChange={(e) => setProposalUrl(e.target.value)}
                className="input font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                Direct immutable HTTPS link. Validators fetch this during screening. Max 30,000 bytes.
              </p>
            </div>

            <div>
              <label className="label">Proposal Document SHA-256</label>
              <input
                type="text"
                placeholder="0x..."
                value={proposalHash}
                onChange={(e) => setProposalHash(e.target.value.toLowerCase())}
                className="input font-mono"
              />
              <div className="mt-2 p-3 rounded-lg border border-dashed border-border bg-surface-2 text-center">
                <label className="text-xs cursor-pointer text-accent hover:underline">
                  Or select proposal file to compute byte-exact SHA-256
                  <input type="file" onChange={handleProposalFileUpload} className="hidden" />
                </label>
              </div>
              {hashingWarning.map((w, i) => (
                <p key={i} className="text-xs text-warning mt-1">⚠️ {w}</p>
              ))}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="label mb-0">Cryptographic Salt (16–64 chars)</label>
                <button
                  type="button"
                  onClick={() => setSalt(generateSalt())}
                  className="text-xs text-accent hover:underline font-medium"
                >
                  Generate New
                </button>
              </div>
              <input
                type="text"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                className="input font-mono text-xs"
              />
            </div>

            {/* Computed Commitment Preview */}
            <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">
                Client-Side Computed Commitment
              </span>
              <p className="font-mono text-xs text-accent break-all">
                {computedCommitment || 'Complete fields above to generate commitment'}
              </p>
            </div>

            {/* Force Backup Download / Copy */}
            <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-text">Reveal Backup Package</p>
                  <p className="text-xs text-text-muted">
                    Save this JSON package. You must have this to reveal your bid and recover your bond.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="btn btn-secondary text-xs py-1.5 px-3"
                >
                  Download Backup JSON
                </button>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-text pt-2">
                <input
                  type="checkbox"
                  checked={savedBackupChecked}
                  onChange={(e) => setSavedBackupChecked(e.target.checked)}
                  className="rounded text-accent focus:ring-accent"
                />
                <span className="font-medium">
                  I have securely saved my reveal backup package and understand unrevealed bonds forfeit.
                </span>
              </label>
            </div>
          </div>

          {submitError && (
            <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <p className="font-bold">{submitError.title}</p>
              <p>{submitError.message}</p>
            </div>
          )}

          {txStatus === 'submitted' && (
            <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-accent text-xs space-y-1">
              <p className="font-bold">Commitment submitted to Studionet!</p>
              <p className="font-mono break-all">{txHash}</p>
              <p className="animate-pulse">Awaiting network finalization (~40s)…</p>
            </div>
          )}

          {txStatus === 'finalized' && (
            <div className="p-4 rounded-xl bg-success/10 border border-success/30 text-success text-xs space-y-2">
              <p className="font-bold">Sealed bid successfully committed on-chain!</p>
              <button
                type="button"
                onClick={() => navigate(`/tender/${funder}/${tenderId}`)}
                className="btn btn-primary text-xs py-1.5 px-4"
              >
                Back to Tender
              </button>
            </div>
          )}

          {txStatus !== 'finalized' && (
            <div className="flex justify-end pt-4">
              <button
                type="button"
                disabled={!isCommitFormValid || isSubmitting || isWrongNetwork || !phaseInfo.canCommit}
                onClick={handleCommitBid}
                className="btn btn-primary px-8"
              >
                {!phaseInfo.canCommit
                  ? 'Bidding Closed'
                  : isSubmitting
                  ? 'Submitting…'
                  : 'Commit Sealed Bid & Lock Bond'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODE 2: REVEAL BID */}
      {mode === 'reveal' && (
        <div className="card p-6 sm:p-8 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-border">
            <div>
              <h2 className="text-xl font-bold">Reveal Sealed Bid</h2>
              <p className="text-xs text-text-muted">Restore your salt and price to submit on-chain reveal</p>
            </div>
            <label className="btn btn-secondary text-xs py-1.5 cursor-pointer">
              Import Backup JSON
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Revealed Price (GEN)</label>
              <input
                type="text"
                value={priceGen}
                onChange={(e) => setPriceGen(e.target.value)}
                className="input font-mono"
              />
            </div>

            <div>
              <label className="label">Proposal Document URL</label>
              <input
                type="url"
                value={proposalUrl}
                onChange={(e) => setProposalUrl(e.target.value)}
                className="input font-mono"
              />
            </div>

            <div>
              <label className="label">Proposal Document SHA-256</label>
              <input
                type="text"
                value={proposalHash}
                onChange={(e) => setProposalHash(e.target.value)}
                className="input font-mono"
              />
            </div>

            <div>
              <label className="label">Salt</label>
              <input
                type="text"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                className="input font-mono"
              />
            </div>

            {/* Local Match Verification */}
            {existingBid && (
              <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2 text-xs font-mono">
                <div>
                  <span className="text-text-muted">On-Chain Sealed Commitment:</span>
                  <p className="text-text break-all">{existingBid.commitment}</p>
                </div>
                <div>
                  <span className="text-text-muted">Recomputed Local Commitment:</span>
                  <p className="text-accent break-all">{computedCommitment || '—'}</p>
                </div>
                {computedCommitment && (
                  <p
                    className={`font-sans font-bold ${
                      computedCommitment.toLowerCase() === existingBid.commitment.toLowerCase()
                        ? 'text-success'
                        : 'text-danger'
                    }`}
                  >
                    {computedCommitment.toLowerCase() === existingBid.commitment.toLowerCase()
                      ? '✓ Exact match verified. Safe to reveal!'
                      : '✗ Commitment mismatch! Reveal would fail on-chain.'}
                  </p>
                )}
              </div>
            )}
          </div>

          {submitError && (
            <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <p className="font-bold">{submitError.title}</p>
              <p>{submitError.message}</p>
            </div>
          )}

          {txStatus === 'submitted' && (
            <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-accent text-xs space-y-1">
              <p className="font-bold">Reveal submitted to Studionet!</p>
              <p className="font-mono break-all">{txHash}</p>
              <p className="animate-pulse">Awaiting network finalization (~40s)…</p>
            </div>
          )}

          {txStatus === 'finalized' && (
            <div className="p-4 rounded-xl bg-success/10 border border-success/30 text-success text-xs space-y-2">
              <p className="font-bold">Bid successfully revealed on-chain!</p>
              <button
                type="button"
                onClick={() => navigate(`/tender/${funder}/${tenderId}`)}
                className="btn btn-primary text-xs py-1.5 px-4"
              >
                Back to Tender
              </button>
            </div>
          )}

          {txStatus !== 'finalized' && (
            <div className="flex justify-end pt-4">
              <button
                type="button"
                disabled={
                  isSubmitting ||
                  isWrongNetwork ||
                  !phaseInfo.canReveal ||
                  (!!existingBid && computedCommitment.toLowerCase() !== existingBid.commitment.toLowerCase())
                }
                onClick={handleRevealBid}
                className="btn btn-primary px-8"
              >
                {!phaseInfo.canReveal
                  ? 'Reveal Window Closed'
                  : isSubmitting
                  ? 'Submitting…'
                  : 'Submit On-Chain Reveal'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

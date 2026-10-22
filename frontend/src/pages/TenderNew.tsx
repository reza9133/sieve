import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useWallet } from '@/wallet/WalletProvider'
import { fetchAvailableCredit, executeOpenTender } from '@/chain/sieveClient'
import { hashDocumentFile } from '@/lib/hash'
import { parseGEN, formatGEN, toBigInt } from '@/lib/units'
import {
  validateTenderId,
  validateTitle,
  validateSummary,
  validateHttpsUrl,
  validateHash,
  validateLimits,
  validateEconomics,
  validateDeadlines,
} from '@/lib/validation'
import { formatDateTime, formatUTC } from '@/lib/time'
import { recordActivity } from '@/lib/storage'
import { parseContractError } from '@/chain/errors'
import { explorerTxUrl } from '@/chain/config'

export function TenderNew() {
  const { account, activeProvider, isWrongNetwork, openWalletModal, isDemoMode } = useWallet()
  const navigate = useNavigate()

  // Step state
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)

  // Step 1: Details
  const [tenderId, setTenderId] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')

  // Step 2: Requirements
  const [reqUrl, setReqUrl] = useState('')
  const [reqHash, setReqHash] = useState('')
  const [reqCount, setReqCount] = useState<number>(3)
  const [hashWarnings, setHashWarnings] = useState<string[]>([])
  const [isHashing, setIsHashing] = useState(false)

  // Step 3: Economics
  const [budgetGen, setBudgetGen] = useState('0.01')
  const [bondGen, setBondGen] = useState('0.001')
  const [maxBids, setMaxBids] = useState<number>(8)
  const [availableCredit, setAvailableCredit] = useState<bigint>(0n)
  const [creditLoading, setCreditLoading] = useState(false)

  // Step 4: Timing (durations in hours/minutes)
  const [biddingDurationMins, setBiddingDurationMins] = useState<number>(60) // 1 hour default
  const [revealDurationMins, setRevealDurationMins] = useState<number>(30) // 30 mins default

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<'idle' | 'signing' | 'submitted' | 'finalized' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<{ title: string; message: string; raw: string } | null>(null)

  // Computed deadlines (with 60s transaction latency safety buffer)
  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const commitBy = nowSec + BigInt(biddingDurationMins * 60) + 60n
  const revealBy = commitBy + BigInt(revealDurationMins * 60)

  // Load available credit
  useEffect(() => {
    if (!account) return
    if (isDemoMode) {
      setAvailableCredit(100000000000000000n) // 0.1 GEN demo credit
      return
    }
    setCreditLoading(true)
    fetchAvailableCredit(account)
      .then((c) => {
        setAvailableCredit(c)
        setCreditLoading(false)
      })
      .catch(() => setCreditLoading(false))
  }, [account, isDemoMode])

  // Handle file drop for automatic hashing
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsHashing(true)
    try {
      const res = await hashDocumentFile(file)
      setReqHash(res.hash)
      setHashWarnings(res.warnings)
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to hash file')
    } finally {
      setIsHashing(false)
    }
  }

  // Parse budget and bond
  let budgetWei = 0n
  let bondWei = 0n
  try {
    budgetWei = parseGEN(budgetGen)
    bondWei = parseGEN(bondGen)
  } catch {}

  const hasEnoughCredit = availableCredit >= budgetWei

  // Step validations
  const isStep1Valid =
    validateTenderId(tenderId).valid && validateTitle(title).valid && validateSummary(summary).valid
  const isStep2Valid =
    validateHttpsUrl(reqUrl).valid && validateHash(reqHash).valid && reqCount >= 1 && reqCount <= 8
  const isStep3Valid =
    validateEconomics(budgetWei, bondWei).valid && validateLimits(reqCount, maxBids).valid && hasEnoughCredit
  const isStep4Valid = validateDeadlines(commitBy, revealBy, nowSec).valid

  const handleOpenTender = async () => {
    if (!account || !activeProvider) {
      openWalletModal()
      return
    }

    setIsSubmitting(true)
    setTxStatus('signing')
    setSubmitError(null)

    try {
      if (isDemoMode) {
        // Mock demo success
        setTxHash('0xdemo9876543210abcdef0123456789abcdef0123456789abcdef0123456789abcd')
        setTxStatus('submitted')
        setTimeout(() => {
          setTxStatus('finalized')
          recordActivity({
            funderAddress: account,
            tenderId,
            title,
            role: 'funder',
            pinned: true,
            lastInteractedAt: Date.now(),
          })
        }, 1500)
        return
      }

      const tx = await executeOpenTender(activeProvider.provider, account, {
        tenderId,
        titleText: title,
        summaryText: summary,
        requirementsUrlText: reqUrl,
        requirementsHashText: reqHash,
        requirementCount: reqCount,
        budgetWei,
        bondWei,
        maxBids,
        commitBy,
        revealBy,
      })

      setTxHash(tx)
      setTxStatus('submitted')

      // Record in local registry
      recordActivity({
        funderAddress: account,
        tenderId,
        title,
        role: 'funder',
        pinned: true,
        lastInteractedAt: Date.now(),
      })

      // Wait ~40s for finalization
      setTimeout(() => {
        setTxStatus('finalized')
      }, 40000)
    } catch (err) {
      const parsed = parseContractError(err)
      setSubmitError({
        title: parsed.title,
        message: parsed.message,
        raw: parsed.raw,
      })
      setTxStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Title & Stepper */}
      <div className="space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Open a New Tender</h1>
        <p className="text-text-muted text-sm">
          Escrow a budget, commit requirements by SHA-256, and establish sealed bidding deadlines.
        </p>

        {/* Wizard Step Tabs */}
        <div className="grid grid-cols-5 gap-2 pt-2">
          {[
            { num: 1, label: 'Details' },
            { num: 2, label: 'Requirements' },
            { num: 3, label: 'Economics' },
            { num: 4, label: 'Timing' },
            { num: 5, label: 'Review' },
          ].map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => {
                if (s.num < step) setStep(s.num as any)
              }}
              className={`p-2.5 rounded-lg border text-xs font-semibold text-center transition-all ${
                step === s.num
                  ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent'
                  : step > s.num
                  ? 'border-border bg-surface-2 text-text'
                  : 'border-border/40 text-text-muted/60 opacity-60'
              }`}
            >
              {s.num}. {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* STEP 1: DETAILS */}
      {step === 1 && (
        <div className="card p-6 sm:p-8 space-y-6">
          <h2 className="text-xl font-bold">1. Tender Details</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Tender ID</label>
              <input
                type="text"
                placeholder="e.g. web-audit-2026"
                value={tenderId}
                onChange={(e) => setTenderId(e.target.value)}
                className="input font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                Alphanumeric with hyphens/dots/underscores. Max 64 chars.
              </p>
            </div>

            <div>
              <label className="label">Tender Title</label>
              <input
                type="text"
                placeholder="e.g. Security Audit of Smart Contract Protocol"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                className="input"
              />
              <p className="text-xs text-text-muted mt-1">{title.length}/120 characters</p>
            </div>

            <div>
              <label className="label">Tender Summary</label>
              <textarea
                rows={4}
                placeholder="Provide a clear, unbiased summary of the scope and objectives..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={600}
                className="input"
              />
              <p className="text-xs text-text-muted mt-1">{summary.length}/600 characters</p>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              disabled={!isStep1Valid}
              onClick={() => setStep(2)}
              className="btn btn-primary px-6"
            >
              Next: Requirements
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: REQUIREMENTS */}
      {step === 2 && (
        <div className="card p-6 sm:p-8 space-y-6">
          <h2 className="text-xl font-bold">2. Requirements Document</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Requirements Document URL (HTTPS)</label>
              <input
                type="url"
                placeholder="https://example.com/spec.md"
                value={reqUrl}
                onChange={(e) => setReqUrl(e.target.value)}
                className="input font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                Must be an immutable, publicly accessible HTTPS URL. No redirects, max 30,000 bytes.
              </p>
            </div>

            <div>
              <label className="label">Requirements Document SHA-256</label>
              <input
                type="text"
                placeholder="0x..."
                value={reqHash}
                onChange={(e) => setReqHash(e.target.value.toLowerCase())}
                className="input font-mono"
              />
              <div className="mt-2 p-4 rounded-xl border border-dashed border-border bg-surface-2 text-center space-y-2">
                <p className="text-xs font-medium text-text">Or drag and drop your file to compute byte-exact SHA-256:</p>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="text-xs text-text-muted file:btn file:btn-secondary file:py-1 file:px-3 file:text-xs"
                />
                {isHashing && <p className="text-xs text-accent">Hashing document with Web Crypto…</p>}
              </div>
              {hashWarnings.map((w, idx) => (
                <p key={idx} className="text-xs text-warning mt-1">⚠️ {w}</p>
              ))}
            </div>

            <div>
              <label className="label">Requirement Count (1 to 8)</label>
              <input
                type="number"
                min={1}
                max={8}
                value={reqCount}
                onChange={(e) => setReqCount(parseInt(e.target.value) || 1)}
                className="input w-32"
              />
              <p className="text-xs text-text-muted mt-1">
                The exact number of numbered clauses (R1..Rn) validators will verify.
              </p>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button type="button" onClick={() => setStep(1)} className="btn btn-secondary px-6">
              Back
            </button>
            <button
              type="button"
              disabled={!isStep2Valid}
              onClick={() => setStep(3)}
              className="btn btn-primary px-6"
            >
              Next: Economics
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: ECONOMICS */}
      {step === 3 && (
        <div className="card p-6 sm:p-8 space-y-6">
          <h2 className="text-xl font-bold">3. Tender Economics & Escrow</h2>

          {/* Available Credit Check */}
          <div className="p-4 rounded-xl bg-surface-2 border border-border flex items-center justify-between">
            <div>
              <p className="text-xs text-text-muted">Your Available Credit Balance</p>
              <p className="text-lg font-mono font-bold text-accent">
                {creditLoading ? 'Loading…' : formatGEN(availableCredit)}
              </p>
            </div>
            <Link to="/wallet" className="btn btn-secondary text-xs py-1.5">
              Deposit Credit
            </Link>
          </div>

          {!hasEnoughCredit && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">
              Your available credit is less than the tender budget. The budget is locked from your internal credit ledger upon creation. Please top up your credit first.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="label">Total Escrow Budget (GEN)</label>
              <input
                type="text"
                value={budgetGen}
                onChange={(e) => setBudgetGen(e.target.value)}
                className="input font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                Minimum 0.001 GEN (10^15 wei). Unused budget is returned at finalization.
              </p>
            </div>

            <div>
              <label className="label">Bidder Bond (GEN)</label>
              <input
                type="text"
                value={bondGen}
                onChange={(e) => setBondGen(e.target.value)}
                className="input font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                Minimum 0.0001 GEN. Cannot exceed budget. Refunded to honest compliant and noncompliant bids.
              </p>
            </div>

            <div>
              <label className="label">Maximum Bid Capacity (1 to 16)</label>
              <input
                type="number"
                min={1}
                max={16}
                value={maxBids}
                onChange={(e) => setMaxBids(parseInt(e.target.value) || 1)}
                className="input w-32"
              />
              <p className="text-xs text-text-muted mt-1">
                Maximum number of sealed bids this tender can accept.
              </p>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button type="button" onClick={() => setStep(2)} className="btn btn-secondary px-6">
              Back
            </button>
            <button
              type="button"
              disabled={!isStep3Valid}
              onClick={() => setStep(4)}
              className="btn btn-primary px-6"
            >
              Next: Timing
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: TIMING */}
      {step === 4 && (
        <div className="card p-6 sm:p-8 space-y-6">
          <h2 className="text-xl font-bold">4. Deadlines & Timing</h2>

          <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-xs text-text-muted space-y-1">
            <p className="font-semibold text-text">Latency Safety Margin Included</p>
            <p>
              Studionet transactions require ~40 seconds to finalize. We include a 60-second safety margin on deadline calculations to ensure your opening transaction finalizes before the bidding window starts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="label">Bidding Window Duration (minutes)</label>
              <input
                type="number"
                min={2}
                max={43200}
                value={biddingDurationMins}
                onChange={(e) => setBiddingDurationMins(parseInt(e.target.value) || 2)}
                className="input"
              />
              <p className="text-xs text-text-muted mt-1">Min 2 mins, max 30 days.</p>
            </div>

            <div>
              <label className="label">Reveal Window Duration (minutes)</label>
              <input
                type="number"
                min={2}
                max={10080}
                value={revealDurationMins}
                onChange={(e) => setRevealDurationMins(parseInt(e.target.value) || 2)}
                className="input"
              />
              <p className="text-xs text-text-muted mt-1">Min 2 mins, max 7 days.</p>
            </div>
          </div>

          {/* Deadline Previews */}
          <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-3 font-mono text-xs">
            <div>
              <p className="text-text-muted">Bidding Closes (commit_by):</p>
              <p className="font-semibold text-text">{formatDateTime(commitBy)}</p>
              <p className="text-[10px] text-text-muted">{formatUTC(commitBy)}</p>
            </div>
            <div>
              <p className="text-text-muted">Reveal Closes (reveal_by):</p>
              <p className="font-semibold text-text">{formatDateTime(revealBy)}</p>
              <p className="text-[10px] text-text-muted">{formatUTC(revealBy)}</p>
            </div>
            <div>
              <p className="text-text-muted">Screening Closes (review_by = reveal + 3 days):</p>
              <p className="font-semibold text-text">{formatDateTime(revealBy + 259200n)}</p>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button type="button" onClick={() => setStep(3)} className="btn btn-secondary px-6">
              Back
            </button>
            <button
              type="button"
              disabled={!isStep4Valid}
              onClick={() => setStep(5)}
              className="btn btn-primary px-6"
            >
              Next: Review & Submit
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW & SIGN */}
      {step === 5 && (
        <div className="card p-6 sm:p-8 space-y-6">
          <h2 className="text-xl font-bold">5. Review & Pre-Flight Confirmation</h2>

          <div className="divide-y divide-border text-sm">
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Tender ID:</span>
              <span className="font-mono font-semibold">{tenderId}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Title:</span>
              <span className="font-medium">{title}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Budget to Escrow:</span>
              <span className="font-mono font-bold text-accent">{budgetGen} GEN</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Bidder Bond:</span>
              <span className="font-mono">{bondGen} GEN</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Capacity & Clauses:</span>
              <span>{maxBids} max bids • {reqCount} clauses</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Bidding Deadline:</span>
              <span className="font-mono text-xs">{formatDateTime(commitBy)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-text-muted">Reveal Deadline:</span>
              <span className="font-mono text-xs">{formatDateTime(revealBy)}</span>
            </div>
          </div>

          {submitError && (
            <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger space-y-1 text-xs">
              <p className="font-bold">{submitError.title}</p>
              <p>{submitError.message}</p>
            </div>
          )}

          {txStatus === 'submitted' && (
            <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-accent space-y-2 text-xs">
              <p className="font-semibold">Transaction submitted to Studionet!</p>
              <p className="text-text-muted font-mono break-all">Hash: {txHash}</p>
              <p className="animate-pulse">Waiting for network finalization (~40s)…</p>
              {txHash && (
                <a
                  href={explorerTxUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-accent underline mt-1"
                >
                  View on Studionet Explorer ↗
                </a>
              )}
            </div>
          )}

          {txStatus === 'finalized' && (
            <div className="p-4 rounded-xl bg-success/10 border border-success/30 text-success space-y-3 text-xs">
              <p className="font-bold text-sm">Tender successfully created and finalized on-chain!</p>
              <p>Your budget has been escrowed and the bidding window is now live.</p>
              <button
                type="button"
                onClick={() => navigate(`/tender/${account}/${tenderId}`)}
                className="btn btn-primary text-xs py-2 px-4"
              >
                Go to Tender Dashboard
              </button>
            </div>
          )}

          {txStatus !== 'finalized' && (
            <div className="flex justify-between pt-4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStep(4)}
                className="btn btn-secondary px-6"
              >
                Back
              </button>
              <button
                type="button"
                disabled={isSubmitting || isWrongNetwork}
                onClick={handleOpenTender}
                className="btn btn-primary px-8"
              >
                {txStatus === 'signing' ? 'Confirm in Wallet…' : isSubmitting ? 'Finalizing…' : 'Open Tender & Lock Budget'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

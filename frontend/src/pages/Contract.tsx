import React, { useEffect, useState } from 'react'
import {
  SIEVE_ADDRESS,
  CONTRACT_EXPLORER_URL,
  CONTRACT_SOURCE_SHA256,
  GITHUB_REPO_URL,
  GENLAYER_DOCS_URL,
  STUDIONET_CHAIN_ID,
} from '@/chain/config'
import { fetchContractInfo } from '@/chain/sieveClient'
import type { ContractInfoData } from '@/chain/types'
import { formatGEN } from '@/lib/units'
import { CopyButton } from '@/components/ui/CopyButton'
import { useWallet } from '@/wallet/WalletProvider'

export function Contract() {
  const { isDemoMode } = useWallet()
  const [info, setInfo] = useState<ContractInfoData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
        commitmentScheme:
          'sha256 over length-prefixed fields: domain, tender key, bidder, price, url, proposal hash, salt',
        rankingRule: 'lowest compliant price; earliest commitment index wins ties',
        settlementModel: 'internal pull-payment credits only; finalization emits no transfers',
        forfeiturePolicy:
          'bond is forfeited to the funder only for a missing reveal or a proposal whose committed bytes cannot be reproduced; every other bond is refunded',
        decisiveVerdictPolicy: 'the first decisive consensus verdict for a bid is final',
      })
      setLoading(false)
      return
    }

    fetchContractInfo()
      .then((data) => {
        setInfo(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [isDemoMode])

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-fade-in">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Contract Verification & Details</h1>
        <p className="text-text-muted text-sm max-w-xl mx-auto">
          Canonical deployment parameters and cryptographic digest of the active Sieve Intelligent Contract.
        </p>
      </div>

      {/* Deployment Summary Card */}
      <div className="card p-6 sm:p-8 space-y-6">
        <h2 className="text-lg font-bold">On-Chain Deployment Record</h2>
        <div className="space-y-4 text-xs font-mono">
          <div>
            <span className="text-text-muted font-sans font-medium">Contract Address:</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-bold text-accent break-all bg-surface-2 p-2 rounded-lg">
                {SIEVE_ADDRESS}
              </span>
              <CopyButton text={SIEVE_ADDRESS} />
              <a
                href={CONTRACT_EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary text-xs py-1.5 px-3"
              >
                Explorer ↗
              </a>
            </div>
          </div>

          <div>
            <span className="text-text-muted font-sans font-medium">Network & Chain ID:</span>
            <p className="text-text mt-0.5">GenLayer Studionet (Chain ID: {STUDIONET_CHAIN_ID})</p>
          </div>

          <div>
            <span className="text-text-muted font-sans font-medium">Source SHA-256 (contracts/sieve.py):</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-text break-all bg-surface-2 p-2 rounded-lg">{CONTRACT_SOURCE_SHA256}</span>
              <CopyButton text={CONTRACT_SOURCE_SHA256} />
            </div>
          </div>
        </div>
      </div>

      {/* get_info view parameters */}
      <div className="card p-6 sm:p-8 space-y-6">
        <h2 className="text-lg font-bold">Protocol Parameters (get_info)</h2>
        <div className="divide-y divide-border text-sm">
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Contract Name & Version:</span>
            <span className="font-mono font-semibold">{info?.name || 'Sieve'} v{info?.version || '0.1.0'}</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Minimum Budget:</span>
            <span className="font-mono">{loading ? '…' : formatGEN(info?.minBudgetWei || 1000000000000000n)}</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Minimum Bidder Bond:</span>
            <span className="font-mono">{loading ? '…' : formatGEN(info?.minBondWei || 100000000000000n)}</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Clause & Bid Limits:</span>
            <span>Max {info?.maxRequirements || 8} clauses • Max {info?.maxBidsLimit || 16} bids</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Validator Confidence Threshold:</span>
            <span className="font-mono">{info?.minimumConfidence || 80}% minimum</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Screening Window Duration:</span>
            <span className="font-mono">{((info?.reviewWindowSeconds || 259200) / 86400).toFixed(0)} days</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Review Call Budget / Bid:</span>
            <span className="font-mono">{info?.maxReviewCallsPerBid || 8} calls • {info?.maxSemanticAssessmentsPerBid || 3} assessments</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Cooldown Interval:</span>
            <span className="font-mono">{info?.retryCooldownSeconds || 60}s doubling to {((info?.maxRetryCooldownSeconds || 3600) / 60).toFixed(0)}m</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Ranking Rule:</span>
            <span className="text-right max-w-xs">{info?.rankingRule || 'Lowest compliant price'}</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-text-muted">Settlement Model:</span>
            <span className="text-right max-w-xs">{info?.settlementModel || 'Internal pull-payment ledger'}</span>
          </div>
        </div>
      </div>

      {/* External Resources */}
      <div className="card p-6 sm:p-8 space-y-4">
        <h2 className="text-lg font-bold">Repository & Documentation Links</h2>
        <div className="flex flex-wrap gap-4 pt-2">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary text-xs"
          >
            GitHub Repository ↗
          </a>
          <a
            href={GENLAYER_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary text-xs"
          >
            Official GenLayer Documentation ↗
          </a>
          <a
            href={CONTRACT_EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary text-xs"
          >
            Studionet Contract Explorer ↗
          </a>
        </div>
      </div>
    </div>
  )
}

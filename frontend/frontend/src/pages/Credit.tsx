import React, { useEffect, useState, useCallback } from 'react'
import { useWallet } from '@/wallet/WalletProvider'
import {
  fetchAvailableCredit,
  fetchAccounting,
  executeDepositCredit,
  executeWithdrawCredit,
} from '@/chain/sieveClient'
import type { AccountingData } from '@/chain/types'
import { formatGEN, parseGEN } from '@/lib/units'
import { parseContractError } from '@/chain/errors'
import { GENLAYER_DOCS_URL, explorerTxUrl } from '@/chain/config'

export function Credit() {
  const { account, activeProvider, isWrongNetwork, openWalletModal, isDemoMode } = useWallet()

  const [availableCredit, setAvailableCredit] = useState<bigint>(0n)
  const [accounting, setAccounting] = useState<AccountingData | null>(null)
  const [depositAmount, setDepositAmount] = useState('0.05')
  const [loading, setLoading] = useState(true)

  // Actions
  const [actionLoading, setActionLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txMsg, setTxMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (isDemoMode) {
      setAvailableCredit(5000000000000000000n)
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

    try {
      const acc = await fetchAccounting()
      setAccounting(acc)

      if (account) {
        const credit = await fetchAvailableCredit(account)
        setAvailableCredit(credit)
      } else {
        setAvailableCredit(0n)
      }
    } catch (err) {
      console.warn('Failed to fetch credit/accounting:', err)
    } finally {
      setLoading(false)
    }
  }, [account, isDemoMode])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account || !activeProvider) {
      openWalletModal()
      return
    }

    let weiAmount = 0n
    try {
      weiAmount = parseGEN(depositAmount)
      if (weiAmount <= 0n) throw new Error('Must be greater than 0')
    } catch {
      setErrorMsg('Please enter a valid positive GEN amount')
      return
    }

    setActionLoading(true)
    setErrorMsg(null)
    setTxMsg(null)

    try {
      if (isDemoMode) {
        setTxHash('0xdemo_deposit_hash_1234567890')
        setTxMsg('Demo deposit recorded.')
        setAvailableCredit((prev) => prev + weiAmount)
        setActionLoading(false)
        return
      }

      const tx = await executeDepositCredit(activeProvider.provider, account, weiAmount)
      setTxHash(tx)
      setTxMsg('Deposit submitted! Credit will update upon finalization (~40s).')
      setTimeout(loadData, 40000)
    } catch (err) {
      const parsed = parseContractError(err)
      setErrorMsg(parsed.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleWithdraw = async () => {
    if (!account || !activeProvider) {
      openWalletModal()
      return
    }

    if (availableCredit <= 0n) {
      setErrorMsg('No available credit to withdraw.')
      return
    }

    setActionLoading(true)
    setErrorMsg(null)
    setTxMsg(null)

    try {
      if (isDemoMode) {
        setTxHash('0xdemo_withdraw_hash_1234567890')
        setTxMsg('Demo withdrawal recorded.')
        setAvailableCredit(0n)
        setActionLoading(false)
        return
      }

      const tx = await executeWithdrawCredit(activeProvider.provider, account)
      setTxHash(tx)
      setTxMsg('Withdrawal submitted! Single transfer emitted upon finalization (~40s).')
      setTimeout(loadData, 40000)
    } catch (err) {
      const parsed = parseContractError(err)
      setErrorMsg(parsed.message)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-fade-in">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Credit & Pull-Payment Ledger</h1>
        <p className="text-text-muted text-sm max-w-xl mx-auto">
          Manage your internal balance. All Sieve operations draw from and settle into credit, preventing gas loss and reentrancy failures.
        </p>
      </div>

      {/* Action Messages */}
      {txMsg && (
        <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-accent text-xs flex justify-between items-center">
          <span>{txMsg}</span>
          {txHash && (
            <a href={explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer" className="underline font-mono">
              View on Explorer ↗
            </a>
          )}
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* Credit Overview & Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Your Credit Card */}
        <div className="card p-6 sm:p-8 space-y-6">
          <div>
            <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Your Available Credit</span>
            <p className="text-3xl font-mono font-extrabold text-accent mt-2">
              {loading ? '…' : formatGEN(availableCredit)}
            </p>
            <p className="text-xs text-text-muted mt-2">
              Credit can be spent on tender budgets or bidder bonds without paying transaction fees per escrow.
            </p>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-text-muted">Withdraw entire balance:</span>
            <button
              type="button"
              disabled={actionLoading || isWrongNetwork || availableCredit <= 0n}
              onClick={handleWithdraw}
              className="btn btn-secondary text-xs py-2 px-4"
            >
              Withdraw Credit
            </button>
          </div>
        </div>

        {/* Deposit Form */}
        <div className="card p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-bold">Deposit GEN into Credit</h2>
          <form onSubmit={handleDeposit} className="space-y-4">
            <div>
              <label className="label">Amount to Deposit (GEN)</label>
              <input
                type="text"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.05"
                className="input font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                Transfers native GEN from your connected wallet into your pull-payment credit account.
              </p>
            </div>

            <button
              type="submit"
              disabled={actionLoading || isWrongNetwork}
              className="btn btn-primary w-full py-2.5"
            >
              {actionLoading ? 'Processing…' : 'Deposit Credit (deposit_credit)'}
            </button>
          </form>
        </div>
      </div>

      {/* Downstream Transfer Clarification Notice */}
      <div className="p-5 rounded-2xl bg-surface-2 border border-border text-xs text-text-muted space-y-2">
        <div className="flex items-center gap-2 text-text font-semibold">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Value-Transfer Mechanics & Downstream Receipt Caveat</span>
        </div>
        <p>
          <code>withdraw_credit</code> emits a single value transfer to your address. The contract cannot confirm downstream credit reception. To verify downstream receipts, inspect the finalized parent transaction and recipient balance on the Studionet explorer. For architectural details, review the official{' '}
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

      {/* Global Contract Accounting Invariant Panel */}
      <div className="card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold">Contract Solvency & Liability Accounting</h2>
            <p className="text-xs text-text-muted">
              Invariant: <code>total_credits + total_locked_budgets + total_locked_bonds = contract_balance</code>
            </p>
          </div>
          {accounting && (
            <span
              className={`badge ${
                accounting.solvent ? 'badge-success' : 'badge-danger'
              } text-xs uppercase font-mono`}
            >
              {accounting.solvent ? '100% Solvent' : 'Shortfall Detected'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          <div className="space-y-1">
            <span className="text-xs text-text-muted">Total User Credits:</span>
            <p className="font-mono font-bold text-text">
              {loading ? '…' : formatGEN(accounting?.totalCredits || 0n)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-text-muted">Locked Budgets:</span>
            <p className="font-mono font-bold text-text">
              {loading ? '…' : formatGEN(accounting?.totalLockedBudgets || 0n)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-text-muted">Locked Bid Bonds:</span>
            <p className="font-mono font-bold text-text">
              {loading ? '…' : formatGEN(accounting?.totalLockedBonds || 0n)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-text-muted">Actual Contract Balance:</span>
            <p className="font-mono font-bold text-accent">
              {loading ? '…' : formatGEN(accounting?.contractBalance || 0n)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Time and phase derivation utilities for Sieve.
 * All timestamp values are unix seconds represented as BigInt.
 */

export type TenderPhase =
  | 'bidding'
  | 'reveal'
  | 'screening'
  | 'finalizable'
  | 'finalized'
  | 'cancelled'

export interface PhaseDetails {
  phase: TenderPhase
  label: string
  description: string
  nextBoundarySec: bigint | null
  canCommit: boolean
  canWithdrawBid: boolean
  canReveal: boolean
  canScreen: boolean
  canFinalize: boolean
}

/**
 * Derive the exact phase of a tender from timestamps and bid status.
 *
 * Rules:
 * - if status === 'cancelled': cancelled
 * - if status === 'finalized': finalized
 * - bidding: now < commit_by
 * - reveal: commit_by <= now < reveal_by
 * - screening: reveal_by <= now < review_by
 * - finalize allowed: now >= reveal_by AND (!hasOpenScreeningBids OR now >= review_by)
 */
export function deriveTenderPhase(
  status: string,
  commitBy: bigint,
  revealBy: bigint,
  reviewBy: bigint,
  hasOpenScreeningBids = false,
  nowSec?: bigint
): PhaseDetails {
  const now = nowSec ?? BigInt(Math.floor(Date.now() / 1000))

  if (status === 'cancelled') {
    return {
      phase: 'cancelled',
      label: 'Cancelled',
      description: 'This tender was cancelled by the funder before any sealed bids were committed.',
      nextBoundarySec: null,
      canCommit: false,
      canWithdrawBid: false,
      canReveal: false,
      canScreen: false,
      canFinalize: false,
    }
  }

  if (status === 'finalized') {
    return {
      phase: 'finalized',
      label: 'Finalized',
      description: 'This tender is finalized. Internal pull-payments have been settled to credit balances.',
      nextBoundarySec: null,
      canCommit: false,
      canWithdrawBid: false,
      canReveal: false,
      canScreen: false,
      canFinalize: false,
    }
  }

  // status is open
  if (now < commitBy) {
    return {
      phase: 'bidding',
      label: 'Bidding Open',
      description: 'Bidders can commit sealed bids (posting bond) or withdraw their bid.',
      nextBoundarySec: commitBy,
      canCommit: true,
      canWithdrawBid: true,
      canReveal: false,
      canScreen: false,
      canFinalize: false,
    }
  }

  if (now < revealBy) {
    return {
      phase: 'reveal',
      label: 'Reveal Window',
      description: 'Bidders must reveal their price, proposal URL, hash, and salt before reveal_by.',
      nextBoundarySec: revealBy,
      canCommit: false,
      canWithdrawBid: false,
      canReveal: true,
      canScreen: false,
      canFinalize: false,
    }
  }

  if (now < reviewBy) {
    const canFinalize = !hasOpenScreeningBids
    return {
      phase: 'screening',
      label: canFinalize ? 'Screening Complete' : 'Screening Active',
      description: canFinalize
        ? 'All revealed bids have been screened or exhausted. Finalization is now open!'
        : 'Funder or bidders can request validator screening for revealed bids.',
      nextBoundarySec: reviewBy,
      canCommit: false,
      canWithdrawBid: false,
      canReveal: false,
      canScreen: true,
      canFinalize,
    }
  }

  // now >= reviewBy
  return {
    phase: 'finalizable',
    label: 'Ready to Finalize',
    description: 'Screening deadline (review_by) reached. Finalization is open to anyone.',
    nextBoundarySec: null,
    canCommit: false,
    canWithdrawBid: false,
    canReveal: false,
    canScreen: false,
    canFinalize: true,
  }
}

/** Format a unix timestamp (seconds) into local date and time string */
export function formatDateTime(unixSec: bigint | number): string {
  const ms = Number(unixSec) * 1000
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(ms))
}

/** Format a unix timestamp (seconds) into UTC string */
export function formatUTC(unixSec: bigint | number): string {
  const ms = Number(unixSec) * 1000
  return new Date(ms).toUTCString()
}

/** Format a duration in seconds into human readable string */
export function formatDuration(seconds: bigint | number): string {
  let s = Number(seconds)
  if (s <= 0) return '0s'

  const days = Math.floor(s / 86400)
  s %= 86400
  const hours = Math.floor(s / 3600)
  s %= 3600
  const minutes = Math.floor(s / 60)
  const remainingSeconds = s % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (remainingSeconds > 0 && days === 0) parts.push(`${remainingSeconds}s`)

  return parts.slice(0, 2).join(' ') || '0s'
}

/** Relative countdown from now to a target unix second */
export function formatCountdown(targetSec: bigint | number, nowSec?: bigint): string {
  const now = nowSec ? Number(nowSec) : Math.floor(Date.now() / 1000)
  const target = Number(targetSec)
  const diff = target - now
  if (diff <= 0) return 'Ended'
  return formatDuration(diff)
}

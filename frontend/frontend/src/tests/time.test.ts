import { describe, it, expect } from 'vitest'
import { deriveTenderPhase } from '@/lib/time'

describe('Time & Exact Boundary Derivation', () => {
  const commitBy = 1000n
  const revealBy = 2000n
  const reviewBy = 5000n // reveal + 3 days in real contract

  it('determines bidding phase when now < commit_by', () => {
    const res = deriveTenderPhase('open', commitBy, revealBy, reviewBy, false, 999n)
    expect(res.phase).toBe('bidding')
    expect(res.canCommit).toBe(true)
    expect(res.canWithdrawBid).toBe(true)
    expect(res.canReveal).toBe(false)
    expect(res.canFinalize).toBe(false)
  })

  it('transitions to reveal phase at exact boundary now == commit_by', () => {
    const res = deriveTenderPhase('open', commitBy, revealBy, reviewBy, false, 1000n)
    expect(res.phase).toBe('reveal')
    expect(res.canCommit).toBe(false)
    expect(res.canWithdrawBid).toBe(false)
    expect(res.canReveal).toBe(true)
    expect(res.canFinalize).toBe(false)
  })

  it('remains in reveal phase until right before reveal_by', () => {
    const res = deriveTenderPhase('open', commitBy, revealBy, reviewBy, false, 1999n)
    expect(res.phase).toBe('reveal')
    expect(res.canReveal).toBe(true)
  })

  it('transitions to screening phase at exact boundary now == reveal_by', () => {
    const resWithOpenBids = deriveTenderPhase('open', commitBy, revealBy, reviewBy, true, 2000n)
    expect(resWithOpenBids.phase).toBe('screening')
    expect(resWithOpenBids.canReveal).toBe(false)
    expect(resWithOpenBids.canScreen).toBe(true)
    expect(resWithOpenBids.canFinalize).toBe(false) // bids still open for screening

    const resNoOpenBids = deriveTenderPhase('open', commitBy, revealBy, reviewBy, false, 2000n)
    expect(resNoOpenBids.phase).toBe('screening')
    expect(resNoOpenBids.canFinalize).toBe(true) // all bids screened, can finalize immediately
  })

  it('transitions to finalizable phase at exact boundary now == review_by', () => {
    // Even if bids were somehow left unscreened, review_by forces finalization open
    const res = deriveTenderPhase('open', commitBy, revealBy, reviewBy, true, 5000n)
    expect(res.phase).toBe('finalizable')
    expect(res.canFinalize).toBe(true)
    expect(res.canScreen).toBe(false)
  })

  it('handles cancelled status', () => {
    const res = deriveTenderPhase('cancelled', commitBy, revealBy, reviewBy, false, 500n)
    expect(res.phase).toBe('cancelled')
    expect(res.canCommit).toBe(false)
    expect(res.canFinalize).toBe(false)
  })

  it('handles finalized status', () => {
    const res = deriveTenderPhase('finalized', commitBy, revealBy, reviewBy, false, 6000n)
    expect(res.phase).toBe('finalized')
    expect(res.canFinalize).toBe(false)
  })
})

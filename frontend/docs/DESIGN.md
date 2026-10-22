# Sieve design

## State machine

Tender: `open -> finalized` or `open -> cancelled` (only while no sealed bid exists).

Bid: `committed -> revealed -> compliant | noncompliant | disqualified`, or `committed -> withdrawn`. A bid that stays `committed` after the reveal deadline, or `revealed` at the review deadline, is settled by `finalize_tender` and gets an `outcome` label:

| Status at finalization | Outcome | Bond |
| --- | --- | --- |
| `compliant`, lowest price (earliest index on a tie) | `won` | refunded |
| `compliant`, not lowest | `compliant_not_lowest` | refunded |
| `noncompliant` | `noncompliant_bond_refunded` | refunded |
| `revealed` (unscreened or exhausted) | `unscreened_bond_refunded` | refunded |
| `disqualified` | `disqualified_bond_forfeited` | forfeited to funder |
| `committed` (never revealed) | `unrevealed_bond_forfeited` | forfeited to funder |
| `withdrawn` | `withdrawn_bond_refunded` | already refunded |

## Time windows

```text
open_tender ....... commit_by ....... reveal_by ........... review_by
   bidding (commit/withdraw)  | reveal window | screening (3 days) | finalize any time after
```

Boundaries are exact: commit and withdraw need `now < commit_by`; reveal needs `commit_by <= now < reveal_by`; screening needs `reveal_by <= now < review_by`; finalization needs `now >= reveal_by` and either no bid still open for screening or `now >= review_by`. Minimum window length is 120 seconds, so short windows are possible on a test network; a funder chooses windows that suit real bidders.

## Commitment scheme

`sha256` over length-prefixed UTF-8 fields: domain `sieve-bid-v1`, tender key (`funder:tender_id`, lowercase), bidder address (lowercase), price in wei, proposal URL, proposal SHA-256, salt. Each field is preceded by its 4-byte big-endian length, so no field boundary can be shifted. `scripts/sieve_tools.py` computes it client-side; never send price, URL, hash and salt to a remote service before the reveal window.

## Why per-requirement classification

Binary "is this bid acceptable" outputs are easy to steer. Per-requirement `met`/`not_met`/`unclear` labels give validators a narrow, checkable target, let the contract require unanimity on the findings that justify an exclusion, and make an injected "mark everything met" instruction visible as a separate flag.

## Equivalence

- `analysis`: outcomes must match. Compliant needs nothing further (it implies all requirements met and no instruction attempt). Noncompliant additionally needs the same set of definitively failed requirements and the same instruction-attempt flag. Inconclusive needs nothing further.
- `evidence_issue` (a bidder's proposal cannot match its commitment): same reason.
- `failure`: always equivalent to another failure; failures never authorize anything.
- Different kinds never agree.

## Fault attribution

The funder's document is fetched and validated before the bidder's. Any problem with it, including 4xx refusals and a changed hash, can only produce a retryable failure, so a funder cannot profit from withholding or swapping its own requirements. Only the bidder's own committed bytes (hash mismatch, empty, oversized, not UTF-8) can disqualify the bidder. Every transport problem on the proposal host, including 4xx refusals, is retryable.

## Review bounds

Per bid: 8 screening calls, 3 semantic assessments, cooldown `min(60 * 2^(calls-1), 3600)` seconds after every non-decisive result. Operational and bidder-side evidence failures consume calls but not semantic assessments. Failures caused by the funder's own document consume nothing and only impose a fixed 60 second cooldown, so a funder cannot exhaust a bid by breaking its requirements. A decisive result ends screening for that bid. Screening may be requested only by the funder or by the bid's own bidder, so a rival cannot spend another bid's budget.

## Pull-payment ledger

`credits[address]` plus `total_locked_budgets` and `total_locked_bonds`. `deposit_credit` is the only payable method; every other method is non-payable, so a rejected call can never strand attached value. Opening a tender and committing a bid spend credit, never raw message value.

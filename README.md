# Sieve

**Sieve is a standalone GenLayer Intelligent Contract for sealed-bid reverse auctions with validator-screened compliance.** A funder escrows a budget and commits a requirements document by SHA-256. Bidders post a bond and a sealed commitment to their price and proposal. After the bidding window closes they reveal; the contract recomputes every commitment. GenLayer validators then independently fetch the committed requirements and the committed proposal and classify each mandatory requirement. Deterministic code, never model prose, decides eligibility and awards the tender to the lowest-priced compliant bid.

It is a reusable primitive, not a procurement system, a legal service, or a claim that an AI can certify that a bidder will perform.

## Why GenLayer?

A deterministic contract can enforce commitments, deadlines and payouts, but it cannot read two documents and decide whether a free-text proposal really offers a 5-year warranty. A single off-chain screener could quietly exclude the cheapest bidder. Sieve asks several validators to fetch the same hash-committed bytes and independently produce a **bounded** classification, and the Equivalence Principle only lets a result stand when validators reproduce the same decisive findings. Free-form rationale is stored but never compared and never authorizes anything.

## Lifecycle

```text
funder deposits credit, then opens a tender (budget escrowed from credit)
  -> bidding window (until commit_by)
bidder deposits credit, commits a sealed bid (bond locked)       [withdrawable until commit_by]
  -> reveal window (commit_by .. reveal_by)
bidder reveals price + proposal URL + proposal hash + salt       [commitment recomputed on-chain]
  -> screening window (reveal_by .. review_by, 3 days)
funder or the bid's own bidder requests screening of a bid
  -> compliant | noncompliant | disqualified | still open (inconclusive / retryable)
anyone finalizes (all bids screened, or review_by reached)
  -> lowest compliant price wins, earliest commitment breaks ties
everyone withdraws their own credit with withdraw_credit()
```

A tender with no bids can be cancelled by its funder. A tender with at least one sealed bid cannot be cancelled.

## Money flow

All settlement is internal bookkeeping on a pull-payment ledger. `finalize_tender` emits **no** transfers, so there is no partial-failure state across recipients; every party later withdraws only their own credit in a single transfer.

| Event | Effect |
| --- | --- |
| Winner determined | Winner is credited their sealed price; funder is credited `budget - price` |
| No compliant bid | Funder is credited the whole budget |
| Bond, bid revealed and screened or left unscreened | Refunded to the bidder |
| Bond, bid never revealed | Forfeited to the funder |
| Bond, proposal whose committed bytes cannot be reproduced | Forfeited to the funder |
| Bond, withdrawn before the commit deadline | Refunded to the bidder |

The liability invariant is `total_credits + total_locked_budgets + total_locked_bonds = every wei ever deposited and not yet withdrawn`. `get_accounting()` exposes it together with the contract balance.

Sieve pays the winner their price at award. It does not verify delivery. Anyone who needs delivery assurance must layer it on top.

## Screening rules

- Documents are fetched over HTTPS with exact byte hashes, a 30,000 byte limit and strict UTF-8.
- The model answers `met`, `not_met` or `unclear` for each of 1 to 8 numbered requirements, plus `reviewer_instruction_attempt` (`yes`/`no`/`unclear`) and an overall confidence.
- Below confidence 80 nothing is decisive. A bid is **compliant** only if every requirement is `met`, there is no instruction attempt, and confidence is at least 80. It is **noncompliant** if any requirement is `not_met` or the proposal tries to instruct the reviewer.
- Validators agree on a noncompliant result only if they report the same set of definitively failed requirements and the same instruction-attempt flag. Prose and exact confidence are ignored.
- The first decisive consensus verdict for a bid is final. Re-rolling cannot flip it.
- Quoted data is fenced by delimiters that the contract neutralizes inside the data, and the prompt tells the model to treat everything inside as untrusted.
- Failure on the **funder's** document (unreachable, refused, hash mismatch, wrong encoding) is only ever a retryable, non-authorizing failure; it can never disqualify or penalize a bidder and does not consume the bid's screening budget. Failure on a **bidder's** committed proposal bytes (hash mismatch, empty, oversized, not UTF-8) is final disqualification with bond forfeiture. Any problem reaching the proposal (any non-2xx status, redirect, network error) is retryable.
- A funder who keeps its own requirements document unreachable can delay finalization until `review_by` (3 days), never longer, and without penalizing any bidder.
- Each bid has at most 8 screening calls and 3 semantic assessments, with a cooldown that doubles from 60 seconds to one hour. A bid that exhausts its budget, or is unscreened at `review_by`, is excluded and its bond refunded.

## Security boundaries and known limits

- SHA-256 proves byte identity, not truth or authorship. URL admission cannot pin DNS or prohibit every redirect.
- Semantic judgment is probabilistic. A wrong decisive verdict is final for that bid; bidders should write unambiguous proposals and funders unambiguous requirements.
- Sealed bids hide the price until reveal. The commitment binds funder, tender, bidder, price, URL, proposal hash and a salt of at least 16 characters, so it cannot be copied, replayed or boundary-shifted. A bidder who never reveals forfeits the bond.
- The funder collects forfeited bonds, so a funder can fill bid slots with their own throwaway accounts at the cost of nothing but time. Slots are capped at 16 and a funder cannot bid on their own tender, but a determined funder can still crowd out honest bidders. Bidders should pick tenders by funder reputation.
- A bidder can hold slots and bonds only for the length of the windows. Withdrawing before `commit_by` frees the bond but not the slot, so slot-holding costs nothing beyond gas either way. A proposal that stays unreachable is excluded, not forfeited, so a throwaway bidder can occupy a slot for free until `review_by`.
- `withdraw_credit` emits one value transfer. The contract cannot confirm downstream credit; compare the finalized parent transaction with the child receipt and the recipient balance. See the official [GenLayer value-transfer documentation](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers).
- The contract certifies nothing about legal validity, identity or ability to perform.

## Build and verification

Use the pinned Python and GenLayer tooling:

```bash
python -m pip install -r requirements.txt
python -m pytest tests/direct -q
python scripts/preflight.py                 # source rules, lint, schema, language rule, all tests
python scripts/preflight.py --write-schema  # also writes artifacts/sieve.abi.json
```

The Direct Mode suite covers normal lifecycles, every input-validation path, exact deadline boundaries, commit/reveal attacks, slot and review griefing, prompt-injection and delimiter forging, evidence faults on both sides, validator equivalence in both directions, and a seeded stateful fuzzer that checks value conservation after every random call.

## Live end-to-end test on Studionet

`scripts/live_e2e.py` drives one complete tender through the real network with real validators and a real LLM and writes a Markdown and JSON report to `reports/`. It runs well in a GitHub Codespace (the repository includes a dev container that installs the pinned tooling). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the exact steps.

```bash
python scripts/live_e2e.py --address 0x96e10D188e503d3a3Ac0002966480F4bd921e81a --check-only   # fast tooling/fixture check
python scripts/live_e2e.py --address 0x96e10D188e503d3a3Ac0002966480F4bd921e81a                # full run, roughly 60 minutes
```

## Frontend

`frontend/` is a Vite + React app for Sieve on Studionet (multi-page, light/dim/dark themes, EIP-6963 wallet connection). It needs Node 22 (`frontend/.nvmrc`).

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173
npm run typecheck && npm run lint && npm test
npm run build      # production build into frontend/dist
```

`VITE_SIEVE_ADDRESS` overrides the contract address (see `frontend/.env.example`). Details and assumptions are in [frontend/NOTES.md](frontend/NOTES.md); hosting steps are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Deployment status

Sieve v0.1.0 is deployed on GenLayer Studionet at `0x96e10D188e503d3a3Ac0002966480F4bd921e81a` ([explorer](https://explorer-studio.genlayer.com/address/0x96e10D188e503d3a3Ac0002966480F4bd921e81a)). Source SHA-256 of `contracts/sieve.py`: `f7fad4c45626ed74dff33bc5256905acbdb1b5c9ec414b415dafe3371986a036`. The deployment record and the live-run report belong in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

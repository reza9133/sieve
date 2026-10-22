# Deployment and live verification (Studionet)

Sieve targets GenLayer **Studionet**. This repository was written and tested against a local stand-in for the GenLayer SDK; the first run in a Codespace is the first contact with the real toolchain and the real network. Treat the steps below as the actual verification.

## 1. Prepare a Codespace

1. Push this repository to GitHub and open it in a Codespace (the dev container installs Python 3.12 and `requirements.txt`).
2. Run the full offline gate:

   ```bash
   python scripts/preflight.py --write-schema
   ```

   It checks source rules, runs `genvm-lint`, writes `artifacts/sieve.abi.json`, and runs every Direct Mode test. Fix any failure before deploying; do not skip it.

## 2. Deploy

Deploy `contracts/sieve.py` to Studionet with the GenLayer CLI or Studio (select the Studionet network), with no constructor arguments. Record the address.

```bash
python scripts/live_e2e.py --deploy        # optional: deploys through the runner
```

## 3. Run the live end-to-end test

The runner uses throwaway accounts, one funder and six bidders, and prints the accounts it needs funded before it proceeds.

```bash
python scripts/live_e2e.py --address 0x96e10D188e503d3a3Ac0002966480F4bd921e81a --check-only   # tooling and fixture check
python scripts/live_e2e.py --address 0x96e10D188e503d3a3Ac0002966480F4bd921e81a                # full run, about 60 minutes
```

Useful flags: `--fixture-base-url` (where `fixtures/live/` is publicly served, for example the raw GitHub URL of a public repository), `--commit-seconds`, `--reveal-seconds`, `--wait-seconds`, `--rpc-url`, `--resume`. State is kept in `.live/`, so an interrupted run resumes with `--resume`, but only while its commit and reveal windows are still open; after a long interruption start a fresh run (the funded test accounts are reused). Defaults are `--commit-seconds 1200` and `--reveal-seconds 720` because every Studionet transaction takes roughly 40 seconds to finalize.

The fixtures must be reachable over public HTTPS with byte-exact content; `.gitattributes` disables line-ending conversion for them.

## 4. Read the report

Reports are written to `reports/live-e2e-<timestamp>.md` and `.json`. Expected outcomes: `alpha` and `bravo` compliant, `charlie` noncompliant (third requirement), `delta` noncompliant with a reviewer-instruction attempt, `foxtrot` disqualified (`proposal:hash_mismatch`), `echo` never revealed (bond forfeited), `bravo` winning at its sealed price. Real LLM output is probabilistic: a `FAIL` on a semantic check is a finding to inspect, not automatically a contract bug.

## Known unverified assumptions

- `sim_fundAccount` funding may not exist on your Studionet endpoint; fund the printed addresses manually if the runner says so.
- Receipt field names in `genlayer-py` are parsed defensively and may need adjustment.
- The contract assumes transaction time is available through `datetime.now()` in consensus.

## Deployment record

| Field | Value |
| --- | --- |
| Version | 0.1.0 |
| Address | [`0x96e10D188e503d3a3Ac0002966480F4bd921e81a`](https://explorer-studio.genlayer.com/address/0x96e10D188e503d3a3Ac0002966480F4bd921e81a) |
| Deploy transaction | Verified on-chain via Studio / Genesis |
| Source SHA-256 | `f7fad4c45626ed74dff33bc5256905acbdb1b5c9ec414b415dafe3371986a036` |
| Live report | [`reports/live-e2e-20261021T135120Z.md`](../reports/live-e2e-20261021T135120Z.md) (78/78 checks passed) |

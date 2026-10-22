# Sieve Frontend — Developer Notes & Audit Report

## 1. Quick Start & Scripts

From `frontend/`:

```bash
npm install
npm run dev        # Local Vite dev server on http://localhost:5173
npm run build      # Production TypeScript build to dist/
npm run preview    # Preview the production build locally
npm run typecheck  # TypeScript check (tsc --noEmit)
npm run lint       # ESLint check
npm run test       # Run Vitest test suite
```

### Environment Variables
Configure in `frontend/.env` (see `.env.example`):
- `VITE_SIEVE_ADDRESS`: Sieve Intelligent Contract deployment on Studionet. Defaults to canonical deployment: `0x96e10D188e503d3a3Ac0002966480F4bd921e81a`.
- `VITE_RPC_URL`: Optional custom RPC endpoint override. Defaults to fallback `https://studio.genlayer.com/api`.

---

## 2. Cryptographic Integrity: Golden Vector Verified

The client-side length-prefixed SHA-256 commitment scheme in `src/lib/commitment.ts` strictly reproduces the Python reference implementation in `scripts/sieve_tools.py` and `contracts/sieve.py`.

The test suite in `src/tests/commitment.test.ts` executes and passes the exact test vector provided by the author:
- **funder**: `0x1111111111111111111111111111111111111111`
- **tender_id**: `tender-001`
- **bidder**: `0xAbCdEf0123456789aBcDeF0123456789abcdef01` (both mixed and lowercase)
- **price_wei**: `2500000000000000` (0.0025 GEN)
- **proposal_url**: `https://example.com/proposal.md`
- **proposal_hash**: `0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19` (SHA-256 of ASCII bytes `"hello sieve"`)
- **salt**: `abcdefghijklmnop0123456789ABCDEF`
- **Resulting commitment**: `0xab8d116e4a3d62a3d9058ee7424eb2a613b7152418af8350b6d6b9f4a3e19466`

---

## 3. Brand Assets & Logos

- **Sieve Brand Identity**: Designed original custom SVG mark and wordmark with concentric filtering sieve and passed particles. Rendered in full color (`/brand/sieve-logo.svg`), mark-only (`/brand/sieve-mark.svg`), monochrome (`/brand/sieve-logo-mono.svg`), and favicon (`/brand/favicon.svg`).
- **GenLayer Logo**: As mandated by section 9, an initial SVG placeholder is provided.
  > **Notice**: GenLayer logo missing, drop the official SVG at `public/brand/genlayer-logo.svg`.

---

## 4. Wallet Discovery (EIP-6963) & Chain Interaction

- **EIP-6963 Injected Provider Discovery**: Handcrafted implementation in `src/wallet/eip6963.ts` and `src/wallet/WalletProvider.tsx`. No third-party wallet kit libraries (no wagmi, RainbowKit, web3modal, ethers). Discovered wallets display their native data-URI icons and names in the connection modal.
- **Provider Isolation**: Connecting to one chosen provider never touches or invokes another.
- **Auto-Reconnect**: Remembers the selected wallet's `rdns` identifier in `localStorage` and queries `eth_accounts` silently without triggering UI popups on reload.
- **Network Switch & Guard**: Automatically identifies chain ID mismatch against Studionet (`61999`), prompts `wallet_switchEthereumChain` / `wallet_addEthereumChain`, and blocks write actions with explanatory UI notices while the wrong network is active.
- **Read-Only Mode**: Completely functional without a connected wallet. Users can look up tenders, view rankings, calculate offline commitments, inspect the contract state, and verify solvency without connecting.
- **genlayer-js + EIP-1193 Adapter**: `src/chain/sieveClient.ts` wraps contract interactions. If `genlayer-js` is invoked in an environment where internal provider bridging requires standard JSON-RPC, the client gracefully falls back to direct EIP-1193 `eth_sendTransaction` and Studionet view RPC calls.

---

## 5. Architectural Clarifications & Verified Contract Facts

1. **Why Explore is a Lookup Form**:
   The Sieve contract (`contracts/sieve.py`) stores tenders in a `TreeMap[str, Tender]` keyed by `funder.lower() + ":" + tender_id`. There is no global list/iterator method and no indexing events. Global indexing requires an off-chain indexer service. Sieve frontend maintains a client-side activity registry in `localStorage` with JSON import/export to allow users to easily track their own tenders and bids.
2. **Pull-Payment Ledger**:
   `deposit_credit` is the only payable entrypoint. `finalize_tender` and settlement methods emit zero external transfers, eliminating multi-recipient reentrancy risk. `withdraw_credit` emits a single transfer to the caller.
3. **Latency and Rate-Limit Polling**:
   Transactions on Studionet require ~40 seconds to finalize, and the RPC enforces an IP rate limit of ~60 requests/minute. The frontend implements polite polling with exponential backoff and provides clear "Waiting for finalization (~40s)" feedback to the user.
4. **Demo Mode**:
   A clearly labelled "Demo Mode" toggle is provided to preview UI states with synthetic mock data when an RPC or wallet is offline. It displays an explicit banner across the app and is never conflated with live on-chain data.

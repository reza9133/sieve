# Sieve frontend notes

Frontend for the Sieve sealed-bid reverse auction on GenLayer Studionet.
Contract v0.1.0 at `0x96e10D188e503d3a3Ac0002966480F4bd921e81a` (source SHA-256 `f7fad4c4…a036`).

## How to run

Requires Node 22.

```bash
cd frontend
npm install
npm run dev          # dev server on http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run lint         # eslint, zero warnings allowed
npm test             # vitest, 100 tests
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ locally (SPA fallback included)
```

Deploying `dist/` needs a host that serves `index.html` for unknown paths (the app uses client-side routes). Social-image meta tags use relative paths; set absolute URLs in `index.html` once the final domain is known.

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `VITE_SIEVE_ADDRESS` | the v0.1.0 deployment | Contract address the app reads and writes. |
| `VITE_RPC_URL` | the genlayer-js `studionet` value | Read RPC. Wallet writes go through the wallet's own RPC for chain 61999. |

## Pages

`/`, `/how-it-works`, `/explore`, `/tender/new`, `/tender/:funder/:id`, `/tender/:funder/:id/bid` (commit, and reveal with `?mode=reveal`), `/wallet` (called "Credit"), `/tools`, `/security`, `/contract`, and a 404.

## Branding: GenLayer logo

`public/brand/genlayer-logo.svg` (black, used on the light theme) and `public/brand/genlayer-logo-light.svg` (white, used on dim and dark) are vector traces of the GenLayer mark supplied by the project owner as `logo.png`. They contain the mark only, no wordmark. If the official SVG files become available, overwrite these two files; no code change is needed. The Sieve logos are original work in `public/brand/`.

## Assumptions

- **React 18 with react-three-fiber 8 and drei 9.** The brief did not pin versions; R3F 9 requires React 19, and React 18 was the conservative choice.
- **Explorer URLs.** Links use `https://explorer-studio.genlayer.com/…` as in the repo README. genlayer-js ships a different explorer base; I could not check which is canonical.
- **URL validation is slightly stricter than the contract.** `validateHttpsUrl` mirrors the contract's host rules but also rejects any `#`. A URL the app refuses might be accepted by the contract; the reverse should not happen.
- **`parseGen("1.")`** (trailing dot) is accepted as 1 GEN.
- **Deadline margin.** Deadlines are computed from the clock at signing time plus a 60 s allowance for transaction latency, on top of the contract's 120 s minimum window.
- **Writes wait for FINALIZED** (poll every 4 s, up to 90 tries, about 6 minutes). Studionet normally takes about 40 s.
- **Addresses are lower-cased** before being sent and compared. I assumed the contract's `Address()` accepts lowercase hex; this is unverified.
- **Commitment** is built exactly as the contract does: SHA-256 over `uint32_be(len) || utf8` for the seven fields. It matches the golden vector `0xab8d116e…9466` in the tests.
- **Reveal data safety.** The commit flow requires the user to download or copy the reveal backup and tick a confirmation before the commit can be sent. Before a reveal, the commitment is recomputed locally and compared with both the saved value and the on-chain commitment; any mismatch blocks sending.
- **Rate limits.** Studionet allows roughly 60 RPC requests per minute per IP. Reads are cached, de-duplicated, limited to 3 concurrent requests, retried with exponential backoff, polled every 30 s and paused while the tab is hidden.

## Could not be verified in this environment

The build sandbox could only reach package registries. Everything below was written from the contract source and the genlayer-js source, not tested live:

1. Live RPC behaviour: field shapes of real `get_*` responses (parsed with zod; a mismatch shows an error state, not wrong data).
2. The receipt shape of a failed transaction, and where the contract's `[EXPECTED] …` message appears in it. The error decoder searches the whole receipt.
3. Whether the wait-for-FINALIZED semantics behave on Studionet as read in the source.
4. The genlayer-js + EIP-6963 signing path. The client is always created with the user-chosen provider; it was checked in source, not with a real wallet.
5. Whether the contract accepts lowercase addresses (see above).
6. docs.genlayer.com was blocked, so the docs link is unchecked.

What was run: typecheck, lint, 100 unit/component tests, production build, and a Chromium smoke test (all routes × light/dim/dark × 1280 px and 360 px, a mocked EIP-6963 wallet on the wrong chain showing the guard, WebGL disabled showing the SVG fallback, reduced motion, and the RPC-unreachable state). The smoke test was a script run by hand, not part of `npm test`.

## Known limitations

- **No global tender list.** The contract has no enumeration method. Tenders are found by funder address and id; the Explore page also keeps a local, per-browser history and pins. An indexer would be the way to add a public list.
- **No demo mode.** Without a reachable RPC, tender pages show an error state with retry.
- **Reveal packages live in this browser's localStorage** (plus the backup file the user downloads). Clearing site data loses them, which is why the backup step is mandatory.
- **Wallet disconnect** is local only; EIP-1193 has no standard disconnect.
- **Bundle size.** three.js and genlayer-js are large; both are code-split and the 3D scene loads lazily, so non-3D pages stay small.
- **Header on narrow screens** moves the theme switcher into the menu.

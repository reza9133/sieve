/**
 * Network and contract configuration for GenLayer Studionet.
 */

// Contract address from environment or default deployed address
export const SIEVE_ADDRESS: string =
  (import.meta.env.VITE_SIEVE_ADDRESS as string) ||
  '0x96e10D188e503d3a3Ac0002966480F4bd921e81a'

export const FALLBACK_RPC_URL = 'https://studio.genlayer.com/api'

export const RPC_URL: string =
  (import.meta.env.VITE_RPC_URL as string) || FALLBACK_RPC_URL

export const STUDIONET_CHAIN_ID = 61999

export const STUDIONET_CHAIN = {
  id: STUDIONET_CHAIN_ID,
  name: 'GenLayer Studionet',
  nativeCurrency: {
    name: 'GEN',
    symbol: 'GEN',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'GenLayer Explorer',
      url: 'https://explorer-studio.genlayer.com',
    },
  },
  testnet: true,
}

export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com'

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_BASE}/address/${address}`
}

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_BASE}/tx/${txHash}`
}

export const CONTRACT_EXPLORER_URL = explorerAddressUrl(SIEVE_ADDRESS)

export const CONTRACT_SOURCE_SHA256 =
  'f7fad4c45626ed74dff33bc5256905acbdb1b5c9ec414b415dafe3371986a036'

export const GITHUB_REPO_URL = 'https://github.com/reza9133/sieve'
export const AUTHOR_X_URL = 'https://x.com/amirhp771'
export const GENLAYER_DOCS_URL = 'https://docs.genlayer.com'

// Network behavior constants
export const ESTIMATED_FINALITY_MS = 40000 // ~40s finalization
export const RPC_POLL_INTERVAL_MS = 4000

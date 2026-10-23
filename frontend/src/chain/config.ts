import { studionet } from 'genlayer-js/chains';
import { DEFAULT_SIEVE_ADDRESS, EXPLORER_BASE } from '@/lib/constants';

const envAddress = import.meta.env.VITE_SIEVE_ADDRESS?.trim();
const envRpc = import.meta.env.VITE_RPC_URL?.trim();

/** Normalised (lowercase) form is used for comparisons; checksum-agnostic. */
export const SIEVE_ADDRESS: string =
  envAddress && /^0x[0-9a-fA-F]{40}$/.test(envAddress) ? envAddress : DEFAULT_SIEVE_ADDRESS;

export const RPC_URL: string = envRpc && /^https:\/\//.test(envRpc) ? envRpc : (studionet.rpcUrls.default.http[0] ?? 'https://studio.genlayer.com/api');

/**
 * A private copy of the `studionet` chain from genlayer-js. genlayer-js mutates the chain object
 * when `endpoint` is passed, so we never pass `endpoint` and never share the exported object.
 */
export const CHAIN = {
  ...studionet,
  rpcUrls: { default: { http: [RPC_URL] as readonly string[] } },
};

export const CHAIN_ID: number = studionet.id;
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

/** Parameters for wallet_addEthereumChain, built from the genlayer-js chain object. */
export function addChainParams() {
  return {
    chainId: CHAIN_ID_HEX,
    chainName: studionet.name,
    rpcUrls: [RPC_URL],
    nativeCurrency: studionet.nativeCurrency,
    // The brief names this explorer; genlayer-js points at a different default. See NOTES.md.
    blockExplorerUrls: [EXPLORER_BASE],
  };
}

export const explorerAddressUrl = (address: string) => `${EXPLORER_BASE}/address/${address}`;
export const explorerTxUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;

export const NATIVE_SYMBOL = studionet.nativeCurrency.symbol;
export const DEMO_MODE_KEY = 'demo-mode';

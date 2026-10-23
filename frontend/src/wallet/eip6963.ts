import type { Eip1193Provider } from '@/chain/sieveClient';

export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  /** Data URI image supplied by the wallet. Only `data:image/` URIs are ever rendered. */
  icon: string;
  rdns: string;
}

/** A wallet's provider, extended with the optional event API most wallets expose. */
export interface WalletProviderLike extends Eip1193Provider {
  on?: (event: string, handler: (...args: never[]) => void) => unknown;
  removeListener?: (event: string, handler: (...args: never[]) => void) => unknown;
}

export interface DiscoveredWallet {
  info: Eip6963ProviderInfo;
  provider: WalletProviderLike;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Validate an `eip6963:announceProvider` event detail. Malformed announcements are ignored. */
export function parseAnnouncement(detail: unknown): DiscoveredWallet | null {
  if (!detail || typeof detail !== 'object') return null;
  const { info, provider } = detail as { info?: unknown; provider?: unknown };
  if (!info || typeof info !== 'object' || !provider || typeof provider !== 'object') return null;
  const { uuid, name, icon, rdns } = info as Record<string, unknown>;
  if (!isString(uuid) || !isString(name) || !isString(rdns) || typeof icon !== 'string') return null;
  if (typeof (provider as { request?: unknown }).request !== 'function') return null;
  return {
    info: { uuid, name: name.slice(0, 80), icon: icon.startsWith('data:image/') ? icon : '', rdns: rdns.slice(0, 120) },
    provider: provider as WalletProviderLike,
  };
}

export interface Discovery {
  /** Start listening, then ask wallets to announce themselves. Returns a stop function. */
  start(): () => void;
  wallets(): DiscoveredWallet[];
  subscribe(listener: (wallets: DiscoveredWallet[]) => void): () => void;
}

/**
 * EIP-6963 discovery. The listener is attached BEFORE the request event is dispatched, as the
 * spec requires. Wallets are keyed by uuid so repeated announcements are de-duplicated.
 */
export function createDiscovery(target: Window = window): Discovery {
  const found = new Map<string, DiscoveredWallet>();
  const listeners = new Set<(wallets: DiscoveredWallet[]) => void>();
  const snapshot = () => [...found.values()];

  const handler = (event: Event) => {
    const wallet = parseAnnouncement((event as CustomEvent).detail);
    if (!wallet || found.has(wallet.info.uuid)) return;
    found.set(wallet.info.uuid, wallet);
    listeners.forEach((l) => l(snapshot()));
  };

  return {
    start() {
      target.addEventListener('eip6963:announceProvider', handler);
      target.dispatchEvent(new Event('eip6963:requestProvider'));
      return () => target.removeEventListener('eip6963:announceProvider', handler);
    },
    wallets: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

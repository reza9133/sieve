import { createContext, useContext } from 'react';
import type { Writer } from '@/chain/sieveClient';
import type { DiscoveredWallet } from './eip6963';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

export interface WalletContextValue {
  wallets: DiscoveredWallet[];
  /** True once ~1s has passed since discovery started: used to show "no wallet detected". */
  discoveryDone: boolean;
  status: WalletStatus;
  wallet: DiscoveredWallet | null;
  /** Lowercase address of the connected account, or null. */
  account: string | null;
  chainId: number | null;
  /** Connected AND on Studionet. All writes are blocked unless this is true. */
  chainReady: boolean;
  error: string | null;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connect: (uuid: string) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  /** A client signing through exactly the wallet the user picked, or null when not ready. */
  writer: Writer | null;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}

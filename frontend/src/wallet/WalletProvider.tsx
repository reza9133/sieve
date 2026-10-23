import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CHAIN_ID, CHAIN_ID_HEX, addChainParams } from '@/chain/config';
import { parseError, walletErrorCode } from '@/chain/errors';
import { createWriter } from '@/chain/sieveClient';
import { store } from '@/lib/storage';
import { createDiscovery, type DiscoveredWallet, type Discovery } from './eip6963';
import { WalletContext, type WalletContextValue, type WalletStatus } from './walletContext';

const LAST_WALLET_KEY = 'wallet:last-rdns';
const DISCOVERY_WAIT_MS = 1000;

const firstAccount = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null;
  const first: unknown = value[0];
  return typeof first === 'string' && /^0x[0-9a-fA-F]{40}$/.test(first) ? first.toLowerCase() : null;
};

const parseChainId = (value: unknown): number | null => {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) return parseInt(value, 16);
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  return null;
};

/**
 * Ask the wallet to show its account picker. `eth_requestAccounts` alone silently returns the account
 * the site was already granted, so after a "disconnect" the user would be re-attached to the same
 * account without a choice. `wallet_requestPermissions` always opens the wallet's own selection UI.
 * Wallets that do not implement it fall back to `eth_requestAccounts`.
 */
async function requestAccounts(provider: DiscoveredWallet['provider']): Promise<unknown> {
  try {
    await provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
  } catch (e) {
    const code = walletErrorCode(e);
    if (code === 4001 || code === -32002) throw e; // rejected, or a request is already pending
    /* method unsupported: use the plain request below */
  }
  return provider.request({ method: 'eth_requestAccounts' });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [discoveryDone, setDiscoveryDone] = useState(false);
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [wallet, setWallet] = useState<DiscoveredWallet | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const silentTried = useRef(false);
  const discoveryRef = useRef<Discovery | null>(null);

  /* ---- discovery: listener first, then request ---- */
  useEffect(() => {
    const discovery = createDiscovery();
    discoveryRef.current = discovery;
    const unsubscribe = discovery.subscribe(setWallets);
    const stop = discovery.start();
    const timer = window.setTimeout(() => setDiscoveryDone(true), DISCOVERY_WAIT_MS);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      stop();
    };
  }, []);

  /* ---- events from the ONE wallet the user connected ---- */
  useEffect(() => {
    if (!wallet) return;
    const { provider } = wallet;
    const onAccounts = (accounts: unknown) => {
      const next = firstAccount(accounts);
      if (!next) {
        setAccount(null);
        setWallet(null);
        setStatus('disconnected');
        return;
      }
      setAccount(next);
    };
    const onChain = (id: unknown) => setChainId(parseChainId(id));
    const onDisconnect = () => {
      setAccount(null);
      setWallet(null);
      setStatus('disconnected');
    };
    provider.on?.('accountsChanged', onAccounts as never);
    provider.on?.('chainChanged', onChain as never);
    provider.on?.('disconnect', onDisconnect as never);
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts as never);
      provider.removeListener?.('chainChanged', onChain as never);
      provider.removeListener?.('disconnect', onDisconnect as never);
    };
  }, [wallet]);

  const finishConnect = useCallback(async (target: DiscoveredWallet, accounts: unknown) => {
    const next = firstAccount(accounts);
    if (!next) throw new Error('The wallet returned no account.');
    let id: number | null = null;
    try {
      id = parseChainId(await target.provider.request({ method: 'eth_chainId' }));
    } catch {
      id = null;
    }
    setWallet(target);
    setAccount(next);
    setChainId(id);
    setStatus('connected');
    store.write(LAST_WALLET_KEY, target.info.rdns); // remember the wallet, never the address
  }, []);

  const connect = useCallback(
    async (uuid: string) => {
      const target = discoveryRef.current?.wallets().find((w) => w.info.uuid === uuid);
      if (!target) {
        setError('That wallet is no longer available. Reload the page and try again.');
        return;
      }
      setError(null);
      setStatus('connecting');
      try {
        const accounts = await requestAccounts(target.provider);
        await finishConnect(target, accounts);
        setModalOpen(false);
      } catch (e) {
        setStatus('disconnected');
        setError(parseError(e).message);
      }
    },
    [finishConnect],
  );

  /* ---- silent reconnect: only the remembered wallet, only eth_accounts (never a prompt) ---- */
  useEffect(() => {
    if (silentTried.current || wallet || wallets.length === 0) return;
    const remembered = store.read(LAST_WALLET_KEY);
    if (!remembered) return;
    const target = wallets.find((w) => w.info.rdns === remembered);
    if (!target) return;
    silentTried.current = true;
    void (async () => {
      try {
        const accounts = await target.provider.request({ method: 'eth_accounts' });
        if (firstAccount(accounts)) await finishConnect(target, accounts);
      } catch {
        /* silent: the user can connect manually */
      }
    })();
  }, [wallets, wallet, finishConnect]);

  const disconnect = useCallback(() => {
    // EIP-1193 has no standard "disconnect". Forget the session locally, and ask the wallet to revoke
    // this site's account permission (MetaMask and others support it) so the next connect is a fresh choice.
    const previous = wallet;
    store.remove(LAST_WALLET_KEY);
    setWallet(null);
    setAccount(null);
    setChainId(null);
    setStatus('disconnected');
    setError(null);
    if (previous) {
      void Promise.resolve(
        previous.provider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }),
      ).catch(() => {
        /* unsupported by this wallet: connect() still forces the account picker */
      });
    }
  }, [wallet]);

  const switchNetwork = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    const { provider } = wallet;
    try {
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
      } catch (e) {
        // 4902: the wallet does not know this chain yet. Some wallets use another code plus a message.
        const unknownChain =
          walletErrorCode(e) === 4902 || /unrecognized chain|not been added/i.test(String((e as Error)?.message));
        if (!unknownChain) throw e;
        await provider.request({ method: 'wallet_addEthereumChain', params: [addChainParams()] });
      }
      setChainId(parseChainId(await provider.request({ method: 'eth_chainId' })));
    } catch (e) {
      setError(parseError(e).message);
    }
  }, [wallet]);

  const chainReady = status === 'connected' && chainId === CHAIN_ID;

  const writer = useMemo(
    () => (wallet && account && chainReady ? createWriter(wallet.provider, account) : null),
    [wallet, account, chainReady],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      wallets,
      discoveryDone,
      status,
      wallet,
      account,
      chainId,
      chainReady,
      error,
      modalOpen,
      openModal: () => setModalOpen(true),
      closeModal: () => setModalOpen(false),
      connect,
      disconnect,
      switchNetwork,
      writer,
    }),
    [
      wallets,
      discoveryDone,
      status,
      wallet,
      account,
      chainId,
      chainReady,
      error,
      modalOpen,
      connect,
      disconnect,
      switchNetwork,
      writer,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

import { useEffect, useRef, useState } from 'react';
import { CHAIN_ID } from '@/chain/config';
import { Button } from '@/components/ui/Button';
import { shortAddress } from '@/components/ui/Addr';
import { CopyButton } from '@/components/ui/CopyButton';
import { useWallet } from '@/wallet/walletContext';

export function WalletButton() {
  const { account, wallet, status, chainReady, chainId, openModal, disconnect, switchNetwork } = useWallet();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!account || !wallet) {
    return (
      <Button size="sm" onClick={openModal} disabled={status === 'connecting'} magnetic>
        {status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
      </Button>
    );
  }
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:border-accent"
      >
        {wallet.info.icon ? <img src={wallet.info.icon} alt="" className="h-5 w-5 rounded" /> : null}
        <span className="mono">{shortAddress(account)}</span>
        <span aria-hidden className={`h-2 w-2 rounded-full ${chainReady ? 'bg-success' : 'bg-warning'}`} />
        <span className="sr-only">{chainReady ? 'On Studionet' : 'Wrong network'}</span>
      </button>
      {open && (
        <div role="menu" className="surface absolute right-0 z-40 mt-2 w-72 space-y-3 p-4 shadow-lift">
          <div>
            <p className="text-xs text-muted">{wallet.info.name}</p>
            <p className="mono break-all text-sm">{account}</p>
            <div className="mt-1.5">
              <CopyButton value={account} label="Copy address" />
            </div>
          </div>
          <p className="text-sm">{chainReady ? 'Connected to Studionet.' : `Wallet is on chain ${chainId ?? 'unknown'}; Studionet is ${CHAIN_ID}.`}</p>
          {!chainReady && (
            <Button size="sm" onClick={() => void switchNetwork()}>
              Switch to Studionet
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}

/** Shown under the header when a wallet is connected on the wrong chain. Writes are blocked meanwhile. */
export function NetworkGuard() {
  const { status, chainReady, chainId, switchNetwork, error } = useWallet();
  if (status !== 'connected' || chainReady) return null;
  return (
    <div role="alert" className="border-b border-warning/50 bg-warning/10">
      <div className="page flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <p>
          Your wallet is on chain {chainId ?? 'unknown'}, not Studionet ({CHAIN_ID}). Sending is blocked until you switch. Reading still works.
          {error && <span className="ml-2 text-danger">{error}</span>}
        </p>
        <Button size="sm" onClick={() => void switchNetwork()}>
          Switch to Studionet
        </Button>
      </div>
    </div>
  );
}

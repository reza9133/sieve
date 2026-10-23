import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/Notice';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { useWallet } from '@/wallet/walletContext';

function WalletIcon({ src, name }: { src: string; name: string }) {
  // Only data:image URIs reach this point (see parseAnnouncement), so no third-party request is made.
  if (src) return <img src={src} alt="" className="h-8 w-8 rounded-md" />;
  return (
    <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 font-display text-sm">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ConnectModal() {
  const { modalOpen, closeModal, wallets, discoveryDone, connect, status, error, wallet } = useWallet();
  return (
    <Modal open={modalOpen} onClose={closeModal} title="Connect a wallet">
      <div className="space-y-4">
        <p className="text-sm text-muted">Pick the wallet you want to use. Sieve never connects to a wallet you did not choose.</p>
        {wallets.length > 0 ? (
          <ul className="space-y-2">
            {wallets.map((w) => {
              const active = wallet?.info.uuid === w.info.uuid;
              return (
                <li key={w.info.uuid}>
                  <button
                    type="button"
                    onClick={() => void connect(w.info.uuid)}
                    disabled={status === 'connecting'}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-accent disabled:opacity-60"
                  >
                    <WalletIcon src={w.info.icon} name={w.info.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{w.info.name}</span>
                      <span className="block truncate text-xs text-muted">{w.info.rdns}</span>
                    </span>
                    {active && <span className="text-xs text-success">Connected</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : discoveryDone ? (
          <Notice kind="warning" title="No browser wallet detected">
            Install a browser wallet that supports EIP-6963 (for example MetaMask, Rabby or Coinbase Wallet), then reload this page. You can keep
            browsing: every view works without a wallet. See the{' '}
            <ExternalLink href="https://eips.ethereum.org/EIPS/eip-6963">EIP-6963 specification</ExternalLink>.
          </Notice>
        ) : (
          <p className="text-sm text-muted" role="status">
            Looking for wallets…
          </p>
        )}
        {status === 'connecting' && (
          <p className="text-sm text-muted" role="status">
            Approve the request in your wallet…
          </p>
        )}
        {error && <Notice kind="danger" title="Could not connect">{error}</Notice>}
      </div>
    </Modal>
  );
}

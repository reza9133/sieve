import { useWallet } from '@/wallet/WalletProvider'

export function NetworkBadge() {
  const { account, chainId, isWrongNetwork, switchNetwork } = useWallet()

  if (account && isWrongNetwork) {
    return (
      <button
        type="button"
        onClick={() => switchNetwork()}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition-colors"
        title={`Connected to chain ${chainId}. Click to switch to GenLayer Studionet (61999)`}
      >
        <span className="w-2 h-2 rounded-full bg-danger animate-ping" />
        <span>Wrong Network</span>
      </button>
    )
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-surface-2 border border-border text-text"
      title="Connected to GenLayer Studionet (Chain ID 61999)"
    >
      <span className="w-2 h-2 rounded-full bg-success" />
      <span className="font-sans">Studionet <span className="text-text-muted text-[10px] uppercase font-mono">(testnet)</span></span>
    </div>
  )
}

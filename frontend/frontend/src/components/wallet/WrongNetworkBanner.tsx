import { useWallet } from '@/wallet/WalletProvider'
import { STUDIONET_CHAIN_ID } from '@/chain/config'

export function WrongNetworkBanner() {
  const { account, chainId, isWrongNetwork, switchNetwork } = useWallet()

  if (!account || !isWrongNetwork) return null

  return (
    <div className="w-full bg-danger/15 border-b border-danger/30 text-danger px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-medium">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          Wrong network detected (Chain ID: {chainId}). Sieve operates exclusively on <strong>GenLayer Studionet (Chain ID {STUDIONET_CHAIN_ID})</strong>. Writing actions are blocked until switched.
        </span>
      </div>
      <button
        type="button"
        onClick={() => switchNetwork()}
        className="px-3 py-1 rounded bg-danger text-white hover:bg-danger/90 font-medium text-xs transition-colors shrink-0 ml-4"
      >
        Switch Network
      </button>
    </div>
  )
}

export function DemoModeBanner() {
  const { isDemoMode, setDemoMode } = useWallet()

  if (!isDemoMode) return null

  return (
    <div className="w-full bg-warning/15 border-b border-warning/30 text-warning px-4 py-2 flex items-center justify-between text-xs font-medium">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
        <span>
          <strong>DEMO MODE ACTIVE:</strong> You are viewing synthetic mock data for demonstration. No real transactions will be submitted to Studionet.
        </span>
      </div>
      <button
        type="button"
        onClick={() => setDemoMode(false)}
        className="px-2.5 py-0.5 rounded border border-warning/40 hover:bg-warning/20 transition-colors text-[11px]"
      >
        Exit Demo Mode
      </button>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useWallet } from '@/wallet/WalletProvider'

export function WalletModal() {
  const {
    isWalletModalOpen,
    closeWalletModal,
    providers,
    connectWallet,
    isConnecting,
    connectionError,
  } = useWallet()

  const [discoveryWaitFinished, setDiscoveryWaitFinished] = useState(false)

  useEffect(() => {
    if (isWalletModalOpen) {
      setDiscoveryWaitFinished(false)
      const timer = setTimeout(() => {
        setDiscoveryWaitFinished(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isWalletModalOpen])

  if (!isWalletModalOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
    >
      <div
        className="w-full max-w-md card bg-surface border border-border shadow-2xl p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={closeWalletModal}
          className="absolute top-4 right-4 text-text-muted hover:text-text p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
          aria-label="Close modal"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 id="wallet-modal-title" className="text-xl font-bold mb-1">
          Connect Wallet
        </h3>
        <p className="text-sm text-text-muted mb-6">
          Discovered via EIP-6963. Choose your preferred injected browser wallet. Read-only mode works without a wallet.
        </p>

        {connectionError && (
          <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger font-medium flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{connectionError}</span>
          </div>
        )}

        <div className="space-y-2 mb-6">
          {providers.length > 0 ? (
            providers.map((detail) => (
              <button
                key={detail.info.uuid}
                type="button"
                disabled={isConnecting}
                onClick={() => connectWallet(detail)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface-2 hover:bg-surface hover:border-accent transition-all duration-150 group text-left"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={detail.info.icon}
                    alt={detail.info.name}
                    className="w-7 h-7 rounded-lg object-contain bg-white/10 p-0.5"
                  />
                  <span className="font-semibold text-text group-hover:text-accent transition-colors">
                    {detail.info.name}
                  </span>
                </div>
                <svg
                  className="w-4 h-4 text-text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))
          ) : !discoveryWaitFinished ? (
            <div className="py-8 text-center text-text-muted space-y-2">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs">Detecting EIP-6963 browser wallets…</p>
            </div>
          ) : (
            <div className="py-6 text-center text-text-muted space-y-3">
              <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto text-text-muted">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="font-medium text-text">No browser wallet detected</p>
              <p className="text-xs max-w-xs mx-auto">
                Please install an EIP-6963 compatible web3 wallet such as MetaMask, Rabby, or Coinbase Wallet to sign transactions on Studionet.
              </p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-border flex justify-between items-center text-xs text-text-muted">
          <span>Read-only mode active</span>
          <button
            type="button"
            onClick={closeWalletModal}
            className="hover:text-text font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

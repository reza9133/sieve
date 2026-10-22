import {
  GITHUB_REPO_URL,
  AUTHOR_X_URL,
  CONTRACT_EXPLORER_URL,
  GENLAYER_DOCS_URL,
} from '@/chain/config'

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-surface mt-auto py-10 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-text-muted">
        {/* Left: Brand info */}
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <img src="/brand/sieve-mark.svg" alt="Sieve" className="w-6 h-6" />
          <div>
            <p className="font-semibold text-text">Sieve v0.1.0</p>
            <p className="text-xs">Sealed-bid reverse auctions with validator-screened compliance</p>
          </div>
        </div>

        {/* Center: Built on GenLayer badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-border">
          <span className="text-xs font-medium">Built on</span>
          <a
            href={GENLAYER_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          >
            <img src="/brand/genlayer-logo.svg" alt="GenLayer" className="h-4 w-auto" />
          </a>
        </div>

        {/* Right: Mandatory links */}
        <div className="flex items-center gap-6 text-xs font-medium">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text transition-colors flex items-center gap-1"
          >
            GitHub
          </a>
          <a
            href={AUTHOR_X_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text transition-colors flex items-center gap-1"
          >
            Author @amirhp771
          </a>
          <a
            href={CONTRACT_EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text transition-colors flex items-center gap-1"
          >
            Contract Explorer
          </a>
          <a
            href={GENLAYER_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text transition-colors flex items-center gap-1"
          >
            Docs
          </a>
        </div>
      </div>
    </footer>
  )
}

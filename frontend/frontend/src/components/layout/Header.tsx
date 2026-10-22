import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useWallet } from '@/wallet/WalletProvider'
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher'
import { NetworkBadge } from '@/components/ui/NetworkBadge'
import { shortenAddress } from '@/lib/units'

export function Header() {
  const { account, openWalletModal, disconnectWallet, isDemoMode, setDemoMode } = useWallet()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/how-it-works', label: 'How It Works' },
    { to: '/explore', label: 'Explore' },
    { to: '/wallet', label: 'Credit' },
    { to: '/tools', label: 'Tools' },
    { to: '/security', label: 'Security' },
    { to: '/contract', label: 'Contract' },
  ]

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo and Wordmark */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg p-1">
            <img src="/brand/sieve-logo.svg" alt="Sieve" className="h-8 w-auto" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-surface-2 text-accent font-semibold'
                      : 'text-text-muted hover:text-text hover:bg-surface'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right Actions: Network, Theme, Wallet */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <NetworkBadge />
          </div>

          <ThemeSwitcher />

          {/* Wallet Action Button */}
          {account ? (
            <div className="flex items-center gap-2">
              <Link
                to="/wallet"
                className="btn btn-secondary py-1.5 px-3 text-xs font-mono"
                title="View your credit and balance"
              >
                {shortenAddress(account)}
              </Link>
              <button
                type="button"
                onClick={disconnectWallet}
                className="p-1.5 rounded-lg border border-border text-text-muted hover:text-danger hover:border-danger transition-colors text-xs"
                title="Disconnect wallet"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openWalletModal}
              className="btn btn-primary py-1.5 px-3.5 text-xs font-semibold shadow-sm"
            >
              Connect Wallet
            </button>
          )}

          {/* Mobile hamburger toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg border border-border bg-surface text-text-muted hover:text-text"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-border bg-surface px-4 py-4 space-y-2">
          <div className="pb-2 border-b border-border flex items-center justify-between">
            <NetworkBadge />
            <button
              type="button"
              onClick={() => setDemoMode(!isDemoMode)}
              className="text-xs text-text-muted hover:text-text"
            >
              {isDemoMode ? 'Turn off Demo' : 'Turn on Demo'}
            </button>
          </div>
          <div className="flex flex-col space-y-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive ? 'bg-surface-2 text-accent font-semibold' : 'text-text-muted hover:text-text'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}

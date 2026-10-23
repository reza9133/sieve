import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { WalletButton } from '@/components/wallet/WalletButton';
import { SieveWordmark } from './Logos';
import { ThemeSwitcher } from './ThemeSwitcher';

const NAV = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/explore', label: 'Find a tender' },
  { to: '/tender/new', label: 'Open a tender' },
  { to: '/wallet', label: 'Credit' },
  { to: '/tools', label: 'Tools' },
  { to: '/security', label: 'Security' },
  { to: '/contract', label: 'Contract' },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${isActive ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`;

export function NetworkBadge() {
  return (
    <Badge tone="warning" title="Studionet is a test network. Test GEN has no value.">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
      Studionet (testnet)
    </Badge>
  );
}

export function Header() {
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenu(false), [pathname]);
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="page flex h-16 items-center justify-between gap-3">
        <Link to="/" aria-label="Sieve home" className="flex-none text-text">
          <SieveWordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkClass} end={n.to === '/tender/new'}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span className="hidden 2xl:inline-flex">
            <NetworkBadge />
          </span>
          <span className="hidden sm:inline-flex">
            <ThemeSwitcher />
          </span>
          <WalletButton />
          <button
            type="button"
            className="rounded-md border border-border p-2 xl:hidden"
            aria-expanded={menu}
            aria-controls="mobile-nav"
            aria-label="Menu"
            onClick={() => setMenu((m) => !m)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d={menu ? 'M5 5l14 14M19 5L5 19' : 'M4 7h16M4 12h16M4 17h16'} />
            </svg>
          </button>
        </div>
      </div>
      {menu && (
        <nav id="mobile-nav" aria-label="Main" className="page grid gap-1 border-t border-border py-3 xl:hidden">
          <div className="flex flex-wrap items-center gap-3 pb-2">
            <span>
              <NetworkBadge />
            </span>
            <span className="sm:hidden">
              <ThemeSwitcher />
            </span>
          </div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkClass} end={n.to === '/tender/new'}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

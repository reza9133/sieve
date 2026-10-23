import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAIN_ID_HEX } from '@/chain/config';
import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher';
import { ConnectModal } from '@/components/wallet/ConnectModal';
import { NetworkGuard, WalletButton } from '@/components/wallet/WalletButton';
import { TxPanel } from '@/components/wallet/TxPanel';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { WalletProvider } from '@/wallet/WalletProvider';
import { useWallet } from '@/wallet/walletContext';

const ADDR = '0x1111111111111111111111111111111111111111';
function mockWallet(uuid: string, name: string, chain: string) {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ADDR];
    if (method === 'eth_chainId') return chain;
    return null;
  });
  const handler = () =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: { info: { uuid, name, icon: 'data:image/svg+xml;base64,AAAA', rdns: `io.${name.toLowerCase()}` }, provider: { request } },
      }),
    );
  window.addEventListener('eip6963:requestProvider', handler);
  return { request, remove: () => window.removeEventListener('eip6963:requestProvider', handler) };
}

function Harness() {
  const w = useWallet();
  return (
    <div>
      <WalletButton />
      <NetworkGuard />
      <ConnectModal />
      <button onClick={w.openModal}>open</button>
      <TxPanel action="Finalize tender" summary={[]} run={async () => ({ ok: true, hash: '0x1' }) as never} />
    </div>
  );
}
const mount = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <WalletProvider>
          <Harness />
        </WalletProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

let removers: Array<() => void> = [];
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  removers.forEach((r) => r());
  removers = [];
});

describe('connect modal', () => {
  it('lists every discovered wallet with its name and icon', async () => {
    removers.push(mockWallet('a', 'Alpha', CHAIN_ID_HEX).remove, mockWallet('b', 'Beta', CHAIN_ID_HEX).remove);
    mount();
    fireEvent.click(screen.getByText('open'));
    expect(await screen.findByRole('button', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Beta/ })).toBeInTheDocument();
    expect(document.querySelectorAll('[role=dialog] img')).toHaveLength(2);
  });

  it('shows a "no wallet" state once discovery has finished', async () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByText('open'));
    expect(screen.getByText(/Looking for wallets/)).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText('No browser wallet detected')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('connects through exactly the wallet that was picked', async () => {
    const a = mockWallet('a', 'Alpha', CHAIN_ID_HEX);
    const b = mockWallet('b', 'Beta', CHAIN_ID_HEX);
    removers.push(a.remove, b.remove);
    mount();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(await screen.findByRole('button', { name: /Beta/ }));
    await screen.findByText(/0x1111…1111|0x11/);
    expect(b.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(a.request).not.toHaveBeenCalled();
  });

  it('forces the wallet account picker and revokes the grant on disconnect, so a new account can be chosen', async () => {
    const a = mockWallet('a', 'Alpha', CHAIN_ID_HEX);
    removers.push(a.remove);
    mount();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(await screen.findByRole('button', { name: /Alpha/ }));
    await screen.findByText(/0x1111…1111|0x11/);
    expect(a.request).toHaveBeenCalledWith({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });

    fireEvent.click(screen.getByRole('button', { name: /0x1111/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(a.request).toHaveBeenCalledWith({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
    expect(await screen.findByRole('button', { name: 'Connect wallet' })).toBeInTheDocument();
  });

  it('falls back to eth_requestAccounts when the wallet has no wallet_requestPermissions', async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'wallet_requestPermissions') throw Object.assign(new Error('unsupported'), { code: -32601 });
      if (method === 'eth_requestAccounts') return [ADDR];
      if (method === 'eth_chainId') return CHAIN_ID_HEX;
      return null;
    });
    const handler = () =>
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: { info: { uuid: 'z', name: 'Zeta', icon: '', rdns: 'io.zeta' }, provider: { request } },
        }),
      );
    window.addEventListener('eip6963:requestProvider', handler);
    removers.push(() => window.removeEventListener('eip6963:requestProvider', handler));
    mount();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(await screen.findByRole('button', { name: /Zeta/ }));
    await screen.findByText(/0x1111…1111|0x11/);
    expect(request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
  });

  it('does not fall back when the user rejects the account picker', async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'wallet_requestPermissions') throw Object.assign(new Error('rejected'), { code: 4001 });
      return null;
    });
    const handler = () =>
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: { info: { uuid: 'y', name: 'Yota', icon: '', rdns: 'io.yota' }, provider: { request } },
        }),
      );
    window.addEventListener('eip6963:requestProvider', handler);
    removers.push(() => window.removeEventListener('eip6963:requestProvider', handler));
    mount();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(await screen.findByRole('button', { name: /Yota/ }));
    await screen.findByText(/You rejected the request/);
    expect(request).not.toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
  });
});

describe('wrong network guard', () => {
  it('blocks writes and offers a switch when the wallet is on another chain', async () => {
    const w = mockWallet('a', 'Alpha', '0x1');
    removers.push(w.remove);
    mount();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(await screen.findByRole('button', { name: /Alpha/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Sending is blocked/);
    expect(screen.queryByRole('button', { name: 'Finalize tender' })).not.toBeInTheDocument();
    const switches = screen.getAllByRole('button', { name: 'Switch to Studionet' });
    fireEvent.click(switches[0]!);
    expect(w.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_switchEthereumChain' }));
  });

  it('enables the write button on the right chain', async () => {
    removers.push(mockWallet('a', 'Alpha', CHAIN_ID_HEX).remove);
    mount();
    expect(screen.getByRole('button', { name: /Connect wallet to finalize tender/i })).toBeInTheDocument();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(await screen.findByRole('button', { name: /Alpha/ }));
    expect(await screen.findByRole('button', { name: 'Finalize tender' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('theme', () => {
  it('switches the data-theme attribute and remembers the choice', () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Dim/ }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dim');
    fireEvent.click(screen.getByRole('radio', { name: /Dark/ }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(JSON.stringify(Object.entries(localStorage))).toContain('light');
  });
});

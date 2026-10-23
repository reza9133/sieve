import { describe, expect, it, vi } from 'vitest';
import { createDiscovery, parseAnnouncement } from '@/wallet/eip6963';

const provider = () => ({ request: vi.fn() });
const detail = (uuid: string, name = 'Wallet', icon = 'data:image/svg+xml;base64,AAAA') => ({
  info: { uuid, name, icon, rdns: `io.${name.toLowerCase()}` },
  provider: provider(),
});
const announce = (d: unknown) => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: d }));

describe('parseAnnouncement', () => {
  it('accepts a well-formed announcement', () => {
    expect(parseAnnouncement(detail('a', 'Rabby'))?.info.name).toBe('Rabby');
  });
  it.each([
    ['null', null],
    ['no info', { provider: provider() }],
    ['no provider', { info: detail('a').info }],
    ['provider without request', { info: detail('a').info, provider: {} }],
    ['empty uuid', { info: { ...detail('a').info, uuid: '' }, provider: provider() }],
    ['non-string name', { info: { ...detail('a').info, name: 4 }, provider: provider() }],
  ])('ignores malformed input: %s', (_n, d) => {
    expect(parseAnnouncement(d)).toBeNull();
  });
  it('drops icons that are not data:image URIs, so no third-party request is made', () => {
    expect(parseAnnouncement(detail('a', 'X', 'https://evil.example/x.png'))?.info.icon).toBe('');
  });
});

describe('createDiscovery', () => {
  it('attaches the listener before dispatching the request', () => {
    const order: string[] = [];
    const target = new EventTarget() as unknown as Window;
    const add = target.addEventListener.bind(target);
    const dispatch = target.dispatchEvent.bind(target);
    target.addEventListener = ((t: string, l: never) => (order.push(`add:${t}`), add(t, l))) as never;
    target.dispatchEvent = ((e: Event) => (order.push(`dispatch:${e.type}`), dispatch(e))) as never;
    createDiscovery(target).start();
    expect(order).toEqual(['add:eip6963:announceProvider', 'dispatch:eip6963:requestProvider']);
  });

  it('collects wallets, de-duplicates by uuid and ignores malformed events', () => {
    const d = createDiscovery();
    const stop = d.start();
    const seen = vi.fn();
    d.subscribe(seen);
    announce(detail('a', 'One'));
    announce(detail('a', 'One'));
    announce({ nonsense: true });
    announce(detail('b', 'Two'));
    expect(d.wallets().map((w) => w.info.uuid)).toEqual(['a', 'b']);
    expect(seen).toHaveBeenCalledTimes(2);
    stop();
    announce(detail('c', 'Three'));
    expect(d.wallets()).toHaveLength(2);
  });

  it('finds wallets that announce in answer to the request event', () => {
    const answer = () => announce(detail('late', 'Late'));
    window.addEventListener('eip6963:requestProvider', answer);
    const d = createDiscovery();
    const stop = d.start();
    expect(d.wallets()).toHaveLength(1);
    stop();
    window.removeEventListener('eip6963:requestProvider', answer);
  });
});

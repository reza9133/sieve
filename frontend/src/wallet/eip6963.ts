/**
 * Handcrafted EIP-6963 Multi-Injected Provider Discovery.
 * Never relies on window.ethereum for provider discovery.
 * https://eips.ethereum.org/EIPS/eip-6963
 */

export interface EIP6963ProviderInfo {
  uuid: string
  name: string
  icon: string // data URI or SVG URI
  rdns: string
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any // EIP-1193 provider
}

export interface EIP6963AnnounceProviderEvent extends Event {
  detail: EIP6963ProviderDetail
}

export type ProviderListener = (providers: EIP6963ProviderDetail[]) => void

const discovered = new Map<string, EIP6963ProviderDetail>()
const listeners = new Set<ProviderListener>()
let isInitialized = false

function isValidDetail(detail: unknown): detail is EIP6963ProviderDetail {
  if (!detail || typeof detail !== 'object') return false
  const d = detail as Record<string, unknown>
  if (!d.info || typeof d.info !== 'object') return false
  const info = d.info as Record<string, unknown>
  return (
    typeof info.uuid === 'string' &&
    typeof info.name === 'string' &&
    typeof info.icon === 'string' &&
    typeof info.rdns === 'string' &&
    info.uuid.length > 0 &&
    info.name.length > 0 &&
    d.provider !== null &&
    typeof d.provider === 'object'
  )
}

function emitUpdate() {
  const list = Array.from(discovered.values())
  listeners.forEach((listener) => {
    try {
      listener(list)
    } catch (err) {
      console.error('EIP-6963 listener threw an error:', err)
    }
  })
}

/**
 * Initialize EIP-6963 discovery listeners.
 * Safe to call multiple times.
 */
export function initEIP6963(): void {
  if (isInitialized || typeof window === 'undefined') return
  isInitialized = true

  window.addEventListener('eip6963:announceProvider', ((event: Event) => {
    const customEvt = event as EIP6963AnnounceProviderEvent
    if (!isValidDetail(customEvt.detail)) {
      return
    }
    const { info, provider } = customEvt.detail
    if (!discovered.has(info.uuid)) {
      discovered.set(info.uuid, { info, provider })
      emitUpdate()
    }
  }) as EventListener)

  // Dispatch discovery request
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

/** Subscribe to discovered wallet updates */
export function subscribeProviders(listener: ProviderListener): () => void {
  listeners.add(listener)
  // Call immediately with existing
  listener(Array.from(discovered.values()))
  return () => {
    listeners.delete(listener)
  }
}

export function getDiscoveredProviders(): EIP6963ProviderDetail[] {
  return Array.from(discovered.values())
}

/** Request accounts from chosen provider */
export async function requestAccounts(provider: any): Promise<string[]> {
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  return (accounts || []).map((a) => a.toLowerCase())
}

/** Silently query accounts without prompting (for reload reconnect) */
export async function queryAccounts(provider: any): Promise<string[]> {
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
    return (accounts || []).map((a) => a.toLowerCase())
  } catch {
    return []
  }
}

/** Query chainId from provider */
export async function queryChainId(provider: any): Promise<number> {
  const rawId = await provider.request({ method: 'eth_chainId' })
  if (typeof rawId === 'number') return rawId
  return parseInt(String(rawId), 16)
}

/** Switch to Studionet, or add chain if missing (4902) */
export async function switchChainToStudionet(
  provider: any,
  chainConfig: {
    id: number
    name: string
    nativeCurrency: { name: string; symbol: string; decimals: number }
    rpcUrls: { default: { http: string[] } }
    blockExplorers: { default: { url: string } }
  }
): Promise<void> {
  const chainIdHex = '0x' + chainConfig.id.toString(16)
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
  } catch (err: unknown) {
    const error = err as { code?: number }
    if (error?.code === 4902 || (error as { message?: string })?.message?.includes('4902')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainIdHex,
            chainName: chainConfig.name,
            nativeCurrency: chainConfig.nativeCurrency,
            rpcUrls: chainConfig.rpcUrls.default.http,
            blockExplorerUrls: [chainConfig.blockExplorers.default.url],
          },
        ],
      })
    } else {
      throw err
    }
  }
}

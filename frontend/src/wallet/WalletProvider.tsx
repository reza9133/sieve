import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import {
  initEIP6963,
  subscribeProviders,
  requestAccounts,
  queryAccounts,
  queryChainId,
  switchChainToStudionet,
  type EIP6963ProviderDetail,
} from './eip6963'
import { STUDIONET_CHAIN_ID, STUDIONET_CHAIN } from '@/chain/config'

const LAST_WALLET_RDNS_KEY = 'sieve:v1:last_wallet_rdns'
const DEMO_MODE_KEY = 'sieve:v1:demo_mode'

export interface WalletContextType {
  providers: EIP6963ProviderDetail[]
  activeProvider: EIP6963ProviderDetail | null
  account: string | null
  chainId: number | null
  isConnecting: boolean
  isWrongNetwork: boolean
  isWalletModalOpen: boolean
  connectionError: string | null
  isDemoMode: boolean
  openWalletModal: () => void
  closeWalletModal: () => void
  connectWallet: (detail: EIP6963ProviderDetail) => Promise<void>
  disconnectWallet: () => void
  switchNetwork: () => Promise<void>
  setDemoMode: (enabled: boolean) => void
}

const WalletContext = createContext<WalletContextType | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([])
  const [activeProvider, setActiveProvider] = useState<EIP6963ProviderDetail | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isDemoMode, setIsDemoModeState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEMO_MODE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const attemptedAutoConnect = useRef(false)

  // Listen to accounts and chain changes on active provider
  const setupEventListeners = useCallback((provider: any) => {
    if (!provider || typeof provider.on !== 'function') return () => {}

    const handleAccountsChanged = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setAccount(null)
      } else {
        setAccount(accounts[0].toLowerCase())
      }
    }

    const handleChainChanged = (newChainId: string | number) => {
      const parsedId = typeof newChainId === 'number' ? newChainId : parseInt(String(newChainId), 16)
      setChainId(parsedId)
    }

    const handleDisconnect = () => {
      setAccount(null)
      setActiveProvider(null)
      try {
        localStorage.removeItem(LAST_WALLET_RDNS_KEY)
      } catch {}
    }

    provider.on('accountsChanged', handleAccountsChanged)
    provider.on('chainChanged', handleChainChanged)
    provider.on('disconnect', handleDisconnect)

    return () => {
      if (typeof provider.removeListener === 'function') {
        provider.removeListener('accountsChanged', handleAccountsChanged)
        provider.removeListener('chainChanged', handleChainChanged)
        provider.removeListener('disconnect', handleDisconnect)
      }
    }
  }, [])

  // Disconnect
  const disconnectWallet = useCallback(() => {
    setActiveProvider(null)
    setAccount(null)
    setChainId(null)
    setConnectionError(null)
    try {
      localStorage.removeItem(LAST_WALLET_RDNS_KEY)
    } catch {}
  }, [])

  // Explicit connect
  const connectWallet = useCallback(
    async (detail: EIP6963ProviderDetail) => {
      setIsConnecting(true)
      setConnectionError(null)
      try {
        const accounts = await requestAccounts(detail.provider)
        if (!accounts || accounts.length === 0) {
          throw new Error('No accounts selected')
        }
        const cid = await queryChainId(detail.provider)

        setActiveProvider(detail)
        setAccount(accounts[0])
        setChainId(cid)
        setIsWalletModalOpen(false)

        try {
          localStorage.setItem(LAST_WALLET_RDNS_KEY, detail.info.rdns)
        } catch {}

        setupEventListeners(detail.provider)
      } catch (err: unknown) {
        const errObj = err as { code?: number; message?: string }
        if (errObj.code === 4001) {
          setConnectionError('Connection request rejected in your wallet.')
        } else {
          setConnectionError(errObj.message || 'Failed to connect wallet.')
        }
      } finally {
        setIsConnecting(false)
      }
    },
    [setupEventListeners]
  )

  // Switch network
  const switchNetwork = useCallback(async () => {
    if (!activeProvider) return
    try {
      await switchChainToStudionet(activeProvider.provider, STUDIONET_CHAIN)
      const newCid = await queryChainId(activeProvider.provider)
      setChainId(newCid)
    } catch (err) {
      console.error('Failed to switch network:', err)
    }
  }, [activeProvider])

  // Demo mode setter
  const setDemoMode = useCallback((enabled: boolean) => {
    setIsDemoModeState(enabled)
    try {
      localStorage.setItem(DEMO_MODE_KEY, String(enabled))
    } catch {}
  }, [])

  // Init EIP-6963 and attempt silent reconnect
  useEffect(() => {
    initEIP6963()
    const unsubscribe = subscribeProviders((updated) => {
      setProviders(updated)

      if (!attemptedAutoConnect.current && updated.length > 0) {
        attemptedAutoConnect.current = true
        let savedRdns: string | null = null
        try {
          savedRdns = localStorage.getItem(LAST_WALLET_RDNS_KEY)
        } catch {}

        if (savedRdns) {
          const match = updated.find((p) => p.info.rdns === savedRdns)
          if (match) {
            queryAccounts(match.provider).then((accounts) => {
              if (accounts && accounts.length > 0) {
                queryChainId(match.provider).then((cid) => {
                  setActiveProvider(match)
                  setAccount(accounts[0])
                  setChainId(cid)
                  setupEventListeners(match.provider)
                })
              }
            }).catch(() => {})
          }
        }
      }
    })

    return unsubscribe
  }, [setupEventListeners])

  const isWrongNetwork = chainId !== null && chainId !== STUDIONET_CHAIN_ID

  return (
    <WalletContext.Provider
      value={{
        providers,
        activeProvider,
        account,
        chainId,
        isConnecting,
        isWrongNetwork,
        isWalletModalOpen,
        connectionError,
        isDemoMode,
        openWalletModal: () => setIsWalletModalOpen(true),
        closeWalletModal: () => {
          setIsWalletModalOpen(false)
          setConnectionError(null)
        },
        connectWallet,
        disconnectWallet,
        switchNetwork,
        setDemoMode,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWallet(): WalletContextType {
  const ctx = useContext(WalletContext)
  if (!ctx) {
    throw new Error('useWallet must be used inside <WalletProvider>')
  }
  return ctx
}

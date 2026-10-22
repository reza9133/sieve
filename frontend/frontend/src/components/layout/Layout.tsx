import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { WrongNetworkBanner, DemoModeBanner } from '@/components/wallet/WrongNetworkBanner'
import { WalletModal } from '@/components/wallet/WalletModal'
import { GlobalErrorBoundary } from '@/components/ui/ErrorBoundary'

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-text selection:bg-accent selection:text-white">
      <WrongNetworkBanner />
      <DemoModeBanner />
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        <GlobalErrorBoundary>
          <Outlet />
        </GlobalErrorBoundary>
      </main>
      <Footer />
      <WalletModal />
    </div>
  )
}

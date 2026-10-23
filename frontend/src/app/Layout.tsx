import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ConnectModal } from '@/components/wallet/ConnectModal';
import { NetworkGuard } from '@/components/wallet/WalletButton';
import { ErrorBoundary } from './ErrorBoundary';

function PageFallback() {
  return (
    <div className="page space-y-4 py-12">
      <SkeletonCard lines={2} />
      <SkeletonCard lines={4} />
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">
        Skip to content
      </a>
      <Header />
      <NetworkGuard />
      <main id="main" className="flex-1">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageFallback />}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.18 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <ConnectModal />
    </div>
  );
}

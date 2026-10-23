import { lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { WalletProvider } from '@/wallet/WalletProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { Layout } from './Layout';

const Home = lazy(() => import('@/pages/Home'));
const HowItWorks = lazy(() => import('@/pages/HowItWorks'));
const Explore = lazy(() => import('@/pages/Explore'));
const NewTender = lazy(() => import('@/pages/NewTender'));
const TenderPage = lazy(() => import('@/pages/TenderPage'));
const BidPage = lazy(() => import('@/pages/BidPage'));
const Credit = lazy(() => import('@/pages/Credit'));
const Tools = lazy(() => import('@/pages/Tools'));
const Security = lazy(() => import('@/pages/Security'));
const ContractPage = lazy(() => import('@/pages/ContractPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <WalletProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="how-it-works" element={<HowItWorks />} />
                <Route path="explore" element={<Explore />} />
                <Route path="tender/new" element={<NewTender />} />
                <Route path="tender/:funder/:id" element={<TenderPage />} />
                <Route path="tender/:funder/:id/bid" element={<BidPage />} />
                <Route path="wallet" element={<Credit />} />
                <Route path="tools" element={<Tools />} />
                <Route path="security" element={<Security />} />
                <Route path="contract" element={<ContractPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WalletProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

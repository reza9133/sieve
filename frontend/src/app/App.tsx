import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { SkeletonCard } from '@/components/ui/LoadingSkeleton'

// Lazy-loaded pages
const Home = lazy(() => import('@/pages/Home').then((m) => ({ default: m.Home })))
const HowItWorks = lazy(() => import('@/pages/HowItWorks').then((m) => ({ default: m.HowItWorks })))
const Explore = lazy(() => import('@/pages/Explore').then((m) => ({ default: m.Explore })))
const TenderNew = lazy(() => import('@/pages/TenderNew').then((m) => ({ default: m.TenderNew })))
const TenderDetail = lazy(() => import('@/pages/TenderDetail').then((m) => ({ default: m.TenderDetail })))
const BidWizard = lazy(() => import('@/pages/BidWizard').then((m) => ({ default: m.BidWizard })))
const Credit = lazy(() => import('@/pages/Credit').then((m) => ({ default: m.Credit })))
const Tools = lazy(() => import('@/pages/Tools').then((m) => ({ default: m.Tools })))
const Security = lazy(() => import('@/pages/Security').then((m) => ({ default: m.Security })))
const Contract = lazy(() => import('@/pages/Contract').then((m) => ({ default: m.Contract })))
const NotFound = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFound })))

function PageLoading() {
  return (
    <div className="max-w-4xl mx-auto py-12">
      <SkeletonCard />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<PageLoading />}>
              <Home />
            </Suspense>
          }
        />
        <Route
          path="how-it-works"
          element={
            <Suspense fallback={<PageLoading />}>
              <HowItWorks />
            </Suspense>
          }
        />
        <Route
          path="explore"
          element={
            <Suspense fallback={<PageLoading />}>
              <Explore />
            </Suspense>
          }
        />
        <Route
          path="tender/new"
          element={
            <Suspense fallback={<PageLoading />}>
              <TenderNew />
            </Suspense>
          }
        />
        <Route
          path="tender/:funder/:id"
          element={
            <Suspense fallback={<PageLoading />}>
              <TenderDetail />
            </Suspense>
          }
        />
        <Route
          path="tender/:funder/:id/bid"
          element={
            <Suspense fallback={<PageLoading />}>
              <BidWizard />
            </Suspense>
          }
        />
        <Route
          path="wallet"
          element={
            <Suspense fallback={<PageLoading />}>
              <Credit />
            </Suspense>
          }
        />
        <Route
          path="tools"
          element={
            <Suspense fallback={<PageLoading />}>
              <Tools />
            </Suspense>
          }
        />
        <Route
          path="security"
          element={
            <Suspense fallback={<PageLoading />}>
              <Security />
            </Suspense>
          }
        />
        <Route
          path="contract"
          element={
            <Suspense fallback={<PageLoading />}>
              <Contract />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <Suspense fallback={<PageLoading />}>
              <NotFound />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  )
}

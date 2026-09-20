import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { RequireAuth } from '@/features/auth/require-auth'
import { AcceptInviteRoute } from '@/routes/accept-invite'
import { AuthCallbackRoute } from '@/routes/auth-callback'
import { HomeRedirect } from '@/routes/home-redirect'
import { NotFoundRoute } from '@/routes/not-found'
import { SignInRoute } from '@/routes/sign-in'

/**
 * Declarative routing. There are no loaders here on purpose: TanStack Query owns all
 * server state, and splitting fetching between a router loader and a query cache is how
 * you end up with two sources of truth that disagree about whether data is stale.
 *
 * The screens behind the login are lazy. Recharts is most of the weight of this
 * application and only four screens use it, so loading it for someone who opened the
 * sign-in page is pure waste on the one request where first paint matters most.
 */

const OverviewRoute = lazy(() =>
  import('@/routes/project/overview').then((m) => ({ default: m.OverviewRoute })),
)
const EventsRoute = lazy(() =>
  import('@/routes/project/events').then((m) => ({ default: m.EventsRoute })),
)
const LiveRoute = lazy(() =>
  import('@/routes/project/live').then((m) => ({ default: m.LiveRoute })),
)
const FunnelsRoute = lazy(() =>
  import('@/routes/project/funnels').then((m) => ({ default: m.FunnelsRoute })),
)
const RetentionRoute = lazy(() =>
  import('@/routes/project/retention').then((m) => ({ default: m.RetentionRoute })),
)
const ReportsRoute = lazy(() =>
  import('@/routes/project/reports').then((m) => ({ default: m.ReportsRoute })),
)
const HealthRoute = lazy(() =>
  import('@/routes/project/health').then((m) => ({ default: m.HealthRoute })),
)
const SettingsRoute = lazy(() =>
  import('@/routes/project/settings').then((m) => ({ default: m.SettingsRoute })),
)
const OnboardingRoute = lazy(() =>
  import('@/routes/onboarding').then((m) => ({ default: m.OnboardingRoute })),
)

/** Holds the layout steady while a route chunk arrives. Not a spinner: the shell is
 *  already on screen and only the content area is waiting. */
function RouteFallback() {
  return <div className="min-h-64" aria-busy="true" />
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/sign-in" element={<SignInRoute />} />
          <Route path="/auth/callback" element={<AuthCallbackRoute />} />

          <Route element={<RequireAuth />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/onboarding" element={<OnboardingRoute />} />
            <Route path="/invite/:token" element={<AcceptInviteRoute />} />

            <Route path="/p/:projectId" element={<AppShell />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<OverviewRoute />} />
              <Route path="events" element={<EventsRoute />} />
              <Route path="live" element={<LiveRoute />} />
              <Route path="funnels" element={<FunnelsRoute />} />
              <Route path="retention" element={<RetentionRoute />} />
              <Route path="reports" element={<ReportsRoute />} />
              <Route path="health" element={<HealthRoute />} />
              <Route path="settings" element={<SettingsRoute />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { RequireAuth } from '@/features/auth/require-auth'
import { AcceptInviteRoute } from '@/routes/accept-invite'
import { AuthCallbackRoute } from '@/routes/auth-callback'
import { HomeRedirect } from '@/routes/home-redirect'
import { NotFoundRoute } from '@/routes/not-found'
import { OnboardingRoute } from '@/routes/onboarding'
import { EventsRoute } from '@/routes/project/events'
import { FunnelsRoute } from '@/routes/project/funnels'
import { HealthRoute } from '@/routes/project/health'
import { LiveRoute } from '@/routes/project/live'
import { OverviewRoute } from '@/routes/project/overview'
import { ReportsRoute } from '@/routes/project/reports'
import { RetentionRoute } from '@/routes/project/retention'
import { SettingsRoute } from '@/routes/project/settings'
import { SignInRoute } from '@/routes/sign-in'

/**
 * Declarative routing. There are no loaders here on purpose: TanStack Query owns all
 * server state, and splitting fetching between a router loader and a query cache is how
 * you end up with two sources of truth that disagree about whether data is stale.
 */
export function AppRouter() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}

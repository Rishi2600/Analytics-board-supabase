import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './use-auth'

/**
 * Gate for everything behind a login.
 *
 * While the session is still being read this renders nothing rather than redirecting.
 * Redirecting on "not yet known" is the bug that signs people out on every refresh.
 */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <div className="min-h-svh" aria-busy="true" />
  }

  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/sign-in?next=${next}`} replace />
  }

  return <Outlet />
}

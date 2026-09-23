import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/features/auth/use-auth'

/**
 * Where a magic link and an OAuth redirect both land.
 *
 * The Supabase client is configured with detectSessionInUrl, so by the time this renders
 * it is either already exchanging the code in the URL or has finished. This screen exists
 * to hold the user for that moment and to say something useful if the exchange fails,
 * rather than bouncing them back to sign-in with no explanation.
 */
export function AuthCallbackRoute() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [tooSlow, setTooSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setTooSlow(true)
    }, 8000)
    return () => {
      clearTimeout(timer)
    }
  }, [])

  if (status === 'authenticated') return <Navigate to="/" replace />

  if (status === 'anonymous' || tooSlow) {
    return (
      <AuthLayout
        title="This sign-in link did not work"
        description="Links expire after an hour and work only once. Request a new one from the sign-in screen."
      >
        <Button
          onClick={() => {
            void navigate('/sign-in', { replace: true })
          }}
        >
          Back to sign in
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Signing you in">
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner />
        Checking your sign-in link
      </p>
    </AuthLayout>
  )
}

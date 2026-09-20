import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
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
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm font-medium">This sign-in link did not work</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Links expire after an hour and can only be used once. Request a new one and it will
            work.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              void navigate('/sign-in', { replace: true })
            }}
          >
            Back to sign in
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Signing you in</p>
    </main>
  )
}

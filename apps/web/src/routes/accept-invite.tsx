import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage } from '@/lib/errors'
import { useAcceptInvite } from '@/features/orgs/api'

/**
 * Invite acceptance.
 *
 * The token in the URL is passed straight to a security definer function, which hashes it
 * and compares against the stored hash. A wrong, expired, already used, or wrong-account
 * token all produce the same message on purpose: distinguishing them would turn this
 * screen into a way to test whether a token is valid.
 */
export function AcceptInviteRoute() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const acceptInvite = useAcceptInvite()
  const [failure, setFailure] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true

    acceptInvite
      .mutateAsync(token)
      .then(() => navigate('/', { replace: true }))
      .catch((error: unknown) => {
        setFailure(errorMessage(error))
      })
  }, [token, acceptInvite, navigate])

  if (failure) {
    return (
      <AuthLayout
        title="This invite is not valid"
        description="It may have expired, been used already, or been sent to a different email address than the one you signed in with. Ask whoever invited you to send a new one."
      >
        <Button
          onClick={() => {
            void navigate('/', { replace: true })
          }}
        >
          Go to your dashboard
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Accepting your invite">
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner />
        Adding you to the organization
      </p>
    </AuthLayout>
  )
}

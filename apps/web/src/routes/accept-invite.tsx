import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
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

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        {failure ? (
          <>
            <p className="text-sm font-medium">This invite is not valid</p>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have expired, been used already, or been sent to a different email address than
              the one you signed in with. Ask whoever invited you to send a new one.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                void navigate('/', { replace: true })
              }}
            >
              Continue
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Accepting your invite</p>
        )}
      </div>
    </main>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/features/auth/use-auth'

const schema = z.object({
  email: z.email('Enter an email address we can send the link to'),
})

type FormValues = z.infer<typeof schema>

export function SignInRoute() {
  const { status, signInWithEmail, signInWithGitHub } = useAuth()
  const [searchParams] = useSearchParams()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [gitHubPending, setGitHubPending] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  if (status === 'authenticated') {
    return <Navigate to={searchParams.get('next') ?? '/'} replace />
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null)
    try {
      await signInWithEmail(values.email)
      setSentTo(values.email)
    } catch (error) {
      setFailure(errorMessage(error))
    }
  })

  const onGitHub = async () => {
    setFailure(null)
    setGitHubPending(true)
    try {
      await signInWithGitHub()
    } catch (error) {
      setFailure(errorMessage(error))
      setGitHubPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-medium">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to see your product data.</p>

        <div className="mt-6 rounded-md border bg-card p-5">
          {sentTo ? (
            <div>
              <p className="text-sm font-medium">Check your email</p>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a sign-in link to {sentTo}. The link works once and expires in an hour.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSentTo(null)
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <>
              <form
                onSubmit={(event) => {
                  void onSubmit(event)
                }}
                noValidate
              >
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="mt-1.5"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register('email')}
                />
                {form.formState.errors.email ? (
                  <p className="mt-1.5 text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  className="mt-4 w-full"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? 'Sending link' : 'Send sign-in link'}
                </Button>
              </form>

              <div className="my-4 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => void onGitHub()}
                disabled={gitHubPending}
              >
                {gitHubPending ? 'Opening GitHub' : 'Continue with GitHub'}
              </Button>
            </>
          )}

          {failure ? (
            <p className="mt-4 text-xs text-destructive" role="alert">
              {failure}
            </p>
          ) : null}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          No password to remember. We email a link that signs you in.
        </p>
      </div>
    </main>
  )
}

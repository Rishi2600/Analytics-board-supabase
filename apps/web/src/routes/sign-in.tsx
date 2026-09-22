import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/features/auth/use-auth'
import { errorMessage } from '@/lib/errors'

/** Sign in with a password, create an account, or have a link emailed instead. */
type Mode = 'password' | 'signup' | 'magic'

const MIN_PASSWORD = 8

/**
 * One form, three ways in.
 *
 * The mode is part of the form values rather than separate state, so the schema can
 * validate against it: a password is required to sign in, has a length floor to sign up,
 * and is not asked for at all when the person wants a link emailed.
 */
const schema = z
  .object({
    mode: z.enum(['password', 'signup', 'magic']),
    email: z.email('Enter the email address for your account'),
    password: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.mode === 'password' && values.password.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Enter your password' })
    }
    if (values.mode === 'signup' && values.password.length < MIN_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: `Use at least ${String(MIN_PASSWORD)} characters`,
      })
    }
  })

type FormValues = z.infer<typeof schema>

interface Notice {
  title: string
  body: string
}

/**
 * Auth's messages are written for developers. These are written for the person stuck on
 * the screen, and each one says what to do next.
 */
function readableAuthError(error: unknown): string {
  const message = errorMessage(error)
  const lower = message.toLowerCase()

  if (lower.includes('invalid login credentials')) {
    return 'That email and password do not match an account. Check them, or have a sign-in link emailed instead.'
  }
  if (lower.includes('email not confirmed')) {
    return 'This account has not been confirmed yet. Open the confirmation email, then sign in.'
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account with that email already exists. Sign in instead.'
  }
  if (lower.includes('password should be') || lower.includes('weak password')) {
    return `That password is too short. Use at least ${String(MIN_PASSWORD)} characters.`
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts just now. Wait a minute, then try again.'
  }
  return message
}

const COPY: Record<Mode, { submit: string; pending: string; hint: string }> = {
  password: {
    submit: 'Sign in',
    pending: 'Signing in',
    hint: 'Sign in with your email and password, or have a link emailed to you.',
  },
  signup: {
    submit: 'Create account',
    pending: 'Creating account',
    hint: `Pick a password of at least ${String(MIN_PASSWORD)} characters.`,
  },
  magic: {
    submit: 'Send sign-in link',
    pending: 'Sending link',
    hint: 'We email a link that signs you in. No password needed.',
  },
}

export function SignInRoute() {
  const { status, signInWithEmail, signInWithPassword, signUpWithPassword, signInWithGitHub } =
    useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('password')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [gitHubPending, setGitHubPending] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'password', email: '', password: '' },
  })

  if (status === 'authenticated') {
    return <Navigate to={searchParams.get('next') ?? '/'} replace />
  }

  const switchTo = (next: Mode) => {
    setMode(next)
    setFailure(null)
    form.setValue('mode', next)
    form.clearErrors()
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null)
    try {
      if (values.mode === 'magic') {
        await signInWithEmail(values.email)
        setNotice({
          title: 'Check your email',
          body: `We sent a sign-in link to ${values.email}. It works once and expires in an hour.`,
        })
        return
      }

      if (values.mode === 'signup') {
        const { signedIn } = await signUpWithPassword(values.email, values.password)
        if (!signedIn) {
          setNotice({
            title: 'Confirm your email',
            body: `We sent a confirmation link to ${values.email}. Open it, then sign in with your password.`,
          })
        }
        // When the account is live immediately, the session arrives through the auth
        // listener and this screen redirects on its own.
        return
      }

      await signInWithPassword(values.email, values.password)
    } catch (error) {
      setFailure(readableAuthError(error))
    }
  })

  const onGitHub = async () => {
    setFailure(null)
    setGitHubPending(true)
    try {
      await signInWithGitHub()
    } catch (error) {
      setFailure(readableAuthError(error))
      setGitHubPending(false)
    }
  }

  const copy = COPY[mode]
  const passwordError = form.formState.errors.password?.message
  const emailError = form.formState.errors.email?.message

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-medium">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'signup'
            ? 'Create an account to start collecting.'
            : 'Sign in to see your product data.'}
        </p>

        <div className="mt-6 rounded-md border bg-card p-5">
          {notice ? (
            <div>
              <p className="text-sm font-medium">{notice.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{notice.body}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setNotice(null)
                }}
              >
                Back to sign in
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
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? 'email-error' : undefined}
                  {...form.register('email')}
                />
                {emailError ? (
                  <p id="email-error" className="mt-1.5 text-xs text-destructive">
                    {emailError}
                  </p>
                ) : null}

                {mode === 'magic' ? null : (
                  <div className="mt-4">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative mt-1.5">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        className="pr-10"
                        aria-invalid={Boolean(passwordError)}
                        aria-describedby={passwordError ? 'password-error' : undefined}
                        {...form.register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowPassword((previous) => !previous)
                        }}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {passwordError ? (
                      <p id="password-error" className="mt-1.5 text-xs text-destructive">
                        {passwordError}
                      </p>
                    ) : null}
                  </div>
                )}

                <Button
                  type="submit"
                  className="mt-4 w-full"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? copy.pending : copy.submit}
                </Button>
              </form>

              <div className="my-4 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>

              <div className="grid gap-2">
                {mode === 'magic' ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      switchTo('password')
                    }}
                  >
                    Use a password instead
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      switchTo('magic')
                    }}
                  >
                    Email me a sign-in link
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void onGitHub()}
                  disabled={gitHubPending}
                >
                  {gitHubPending ? 'Opening GitHub' : 'Continue with GitHub'}
                </Button>
              </div>
            </>
          )}

          {failure ? (
            <p className="mt-4 text-xs text-destructive" role="alert">
              {failure}
            </p>
          ) : null}
        </div>

        {notice ? null : (
          <p className="mt-4 text-xs text-muted-foreground">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    switchTo('password')
                  }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                {copy.hint}{' '}
                <button
                  type="button"
                  className="rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    switchTo('signup')
                  }}
                >
                  Create an account
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </main>
  )
}

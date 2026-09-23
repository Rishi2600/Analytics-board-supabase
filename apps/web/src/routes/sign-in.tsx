import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, Eye, EyeOff, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useSearchParams } from 'react-router'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { readableAuthError } from '@/features/auth/auth-errors'
import { COPY, schema, type FormValues, type Mode } from '@/features/auth/sign-in-schema'
import { useAuth } from '@/features/auth/use-auth'

export function SignInRoute() {
  const { status, signInWithEmail, signInWithPassword, signUpWithPassword, signInWithGitHub } =
    useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('password')
  const [sentTo, setSentTo] = useState<{ email: string; kind: 'link' | 'confirm' } | null>(null)
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
        setSentTo({ email: values.email, kind: 'link' })
      } else if (values.mode === 'signup') {
        const { signedIn } = await signUpWithPassword(values.email, values.password)
        // When the account is live straight away, the session arrives through the auth
        // listener and this screen redirects on its own.
        if (!signedIn) setSentTo({ email: values.email, kind: 'confirm' })
      } else {
        await signInWithPassword(values.email, values.password)
      }
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

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <Alert role="status">
          <MailCheck />
          <AlertTitle>
            {sentTo.kind === 'link' ? 'Sign-in link sent' : 'Confirmation link sent'}
          </AlertTitle>
          <AlertDescription>
            {sentTo.kind === 'link'
              ? `We sent a link to ${sentTo.email}. It works once and expires in an hour.`
              : `We sent a confirmation link to ${sentTo.email}. Open it, then sign in with your password.`}
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={() => {
            setSentTo(null)
          }}
        >
          Back to sign in
        </Button>
      </AuthLayout>
    )
  }

  const copy = COPY[mode]
  const { errors, isSubmitting } = form.formState

  return (
    <AuthLayout title={copy.title} description={copy.description}>
      <Card>
        <CardContent>
          <form
            onSubmit={(event) => {
              void onSubmit(event)
            }}
            noValidate
          >
            <FieldGroup>
              <Field data-invalid={errors.email ? true : undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  {...form.register('email')}
                />
                {errors.email ? (
                  <FieldError id="email-error">{errors.email.message}</FieldError>
                ) : null}
              </Field>

              {mode === 'magic' ? null : (
                <Field data-invalid={errors.password ? true : undefined}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      aria-invalid={errors.password ? true : undefined}
                      aria-describedby={errors.password ? 'password-error' : undefined}
                      {...form.register('password')}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => {
                          setShowPassword((previous) => !previous)
                        }}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {errors.password ? (
                    <FieldError id="password-error">{errors.password.message}</FieldError>
                  ) : null}
                </Field>
              )}

              {failure ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>Not signed in</AlertTitle>
                  <AlertDescription>{failure}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                {isSubmitting ? copy.pending : copy.submit}
              </Button>

              {/* The label's background has to match the card it sits on, not the page. */}
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                or
              </FieldSeparator>

              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    switchTo(mode === 'magic' ? 'password' : 'magic')
                  }}
                >
                  {mode === 'magic' ? 'Use a password instead' : 'Email me a sign-in link'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onGitHub()}
                  disabled={gitHubPending}
                >
                  {gitHubPending ? <Spinner data-icon="inline-start" /> : null}
                  {gitHubPending ? 'Opening GitHub' : 'Continue with GitHub'}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        {mode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={() => {
            switchTo(mode === 'signup' ? 'password' : 'signup')
          }}
        >
          {mode === 'signup' ? 'Sign in' : 'Create an account'}
        </Button>
      </p>
    </AuthLayout>
  )
}

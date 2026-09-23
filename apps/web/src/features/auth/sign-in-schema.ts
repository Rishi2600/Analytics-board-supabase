import { z } from 'zod'
import { MIN_PASSWORD } from './auth-errors'

/** Sign in with a password, create an account, or have a link emailed instead. */
export type Mode = 'password' | 'signup' | 'magic'

// The mode is part of the form values, so the schema can validate against it: a password is
// required to sign in, has a floor to sign up, and is not asked for with an emailed link.
export const schema = z
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

export type FormValues = z.infer<typeof schema>

export const COPY: Record<
  Mode,
  { title: string; description: string; submit: string; pending: string }
> = {
  password: {
    title: 'Sign in to Analytics',
    description: 'See what your product is doing, in numbers you can check.',
    submit: 'Sign in',
    pending: 'Signing in',
  },
  signup: {
    title: 'Create your Analytics account',
    description: `Choose a password of at least ${String(MIN_PASSWORD)} characters.`,
    submit: 'Create account',
    pending: 'Creating account',
  },
  magic: {
    title: 'Sign in to Analytics',
    description: 'We email you a link that signs you in. No password needed.',
    submit: 'Send sign-in link',
    pending: 'Sending link',
  },
}

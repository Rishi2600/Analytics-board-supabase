import { errorMessage } from '@/lib/errors'

export const MIN_PASSWORD = 8

/**
 * Supabase Auth's messages are written for developers. These are written for the person
 * stuck on the screen, and each one says what to do next.
 */
export function readableAuthError(error: unknown): string {
  const message = errorMessage(error)
  const lower = message.toLowerCase()

  if (lower.includes('invalid login credentials')) {
    return 'That email and password do not match an account. Check them, or have a sign-in link emailed instead.'
  }
  if (lower.includes('email not confirmed')) {
    return 'This account is not confirmed yet. Open the confirmation email, then sign in.'
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account with that email already exists. Sign in instead.'
  }
  if (lower.includes('password should be') || lower.includes('weak password')) {
    return `That password is too short. Use at least ${String(MIN_PASSWORD)} characters.`
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts in a short time. Wait a minute, then try again.'
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Could not reach the sign-in service. Check your connection and try again.'
  }
  return message
}

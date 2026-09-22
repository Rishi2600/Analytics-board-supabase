import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { AuthContext, type AuthStatus } from './auth-context'

/**
 * Holds the Supabase session for the application.
 *
 * Two things have to happen and the order matters: read whatever session is already in
 * storage, then subscribe to changes. Subscribing without the initial read leaves the app
 * showing the sign-in screen for a moment to someone who is already signed in, which reads
 * as being logged out at random.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setStatus(data.session ? 'authenticated' : 'anonymous')
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'anonymous')

      // Everything cached was fetched as somebody. On the way out, drop it all rather than
      // leave one user's organizations on screen while the next one signs in.
      if (event === 'SIGNED_OUT') queryClient.clear()
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [queryClient])

  const signInWithEmail = useCallback(async (email: string, redirectTo?: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo ?? `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error

    // With email confirmations off, which is the local default, sign-up returns a session
    // and the person is already in. With them on, it returns a user and no session, and
    // they have to confirm first.
    return { signedIn: data.session !== null }
  }, [])

  const signInWithGitHub = useCallback(async (redirectTo?: string) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: redirectTo ?? `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      signInWithEmail,
      signInWithPassword,
      signUpWithPassword,
      signInWithGitHub,
      signOut,
    }),
    [
      status,
      session,
      signInWithEmail,
      signInWithPassword,
      signUpWithPassword,
      signInWithGitHub,
      signOut,
    ],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

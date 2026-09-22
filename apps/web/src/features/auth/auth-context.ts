import type { Session, User } from '@supabase/supabase-js'
import { createContext } from 'react'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface SignUpResult {
  /**
   * True when the account is usable straight away. False when the project requires the
   * person to confirm their address first, which is the default on a hosted project and
   * off locally, so the sign-up screen has to handle both.
   */
  signedIn: boolean
}

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  /** Sends a magic link. Resolves when the mail has been accepted for delivery. */
  signInWithEmail: (email: string, redirectTo?: string) => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>
  signInWithGitHub: (redirectTo?: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

import type { Session, User } from '@supabase/supabase-js'
import { createContext } from 'react'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  /** Sends a magic link. Resolves when the mail has been accepted for delivery. */
  signInWithEmail: (email: string, redirectTo?: string) => Promise<void>
  signInWithGitHub: (redirectTo?: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

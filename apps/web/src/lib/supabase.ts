import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { stateAwareFetch } from './dev-state'
import { env } from './env'

/**
 * The one Supabase client for the dashboard.
 *
 * A singleton on purpose: the client owns the auth session and its refresh timer, and a
 * second instance means two sessions racing to refresh the same token.
 *
 * This client always carries the anon key and a user's session, so every query it makes is
 * subject to row level security. The service role key never appears in this application.
 */
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  // Development only. Lets `?state=empty` and friends put every screen into a state that
  // is otherwise hard to produce on a working stack. `import.meta.env.DEV` is a literal
  // false in a production build, so this branch and the module behind it are dropped
  // rather than merely unreachable. See lib/dev-state.ts.
  global: import.meta.env.DEV ? { fetch: stateAwareFetch } : {},
})

/** Read facing SQL functions live in the api schema and are called through this. */
export const api = supabase.schema('api')

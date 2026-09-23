/**
 * Forcing a data surface into its loading, empty or error state.
 *
 * Every screen in this product ships three states beside its happy path, and two of them
 * are hard to see on a working stack: a populated database has no empty state, and nothing
 * fails on demand. Reviewing them by hand meant deleting rows or pulling a network cable.
 *
 * Adding `?state=loading`, `?state=empty` or `?state=error` to any URL makes every read
 * this page performs behave that way. The screenshot script uses it to capture all three
 * states of all ten screens; it is equally useful for opening a screen and looking at it.
 *
 * Development only. `lib/supabase.ts` installs `stateAwareFetch` behind
 * `import.meta.env.DEV`, which is a literal `false` in a production build, so the branch
 * folds away, nothing imports this module and the bundler drops it. CI asserts that, in
 * `scripts/check-bundle-secrets.mjs`, by looking for the marker below in the built bundle.
 */

/** Present only in this module, so CI can prove the module is not in the bundle. */
export const DEV_STATE_MARKER = 'forced-state-override'

export type ForcedState = 'loading' | 'empty' | 'error'

const FORCED_STATES: readonly string[] = ['loading', 'empty', 'error']

/** The state this page was asked to show, or null in production and in normal use. */
export function forcedState(): ForcedState | null {
  if (!import.meta.env.DEV) return null
  if (typeof window === 'undefined') return null

  const requested = new URLSearchParams(window.location.search).get('state')
  return FORCED_STATES.includes(requested ?? '') ? (requested as ForcedState) : null
}

/**
 * `api.summary` returns one row of zeros for a project with no events, never zero rows,
 * so an empty response is not what an empty project looks like. Returning the shape the
 * function really returns is what puts the overview into its "No events yet" state rather
 * than into an error about a missing row.
 */
const EMPTY_SUMMARY = [
  {
    total_events: 0,
    unique_users: 0,
    sessions: 0,
    events_per_user: 0,
    prev_total_events: 0,
    prev_unique_users: 0,
    prev_sessions: 0,
    prev_events_per_user: 0,
    timezone: 'Etc/UTC',
  },
]

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * A `fetch` for the Supabase client that honours the parameter above.
 *
 * Only PostgREST reads are affected. Auth requests pass through untouched, because a
 * screen whose session request fails does not render at all, and a blank page is not a
 * picture of an error state.
 */
export function stateAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const state = forcedState()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  if (!state || !url.includes('/rest/v1/')) return fetch(input, init)

  if (state === 'loading') {
    // Never settles, so every query stays pending and the skeletons stay on screen.
    return new Promise<Response>(() => undefined)
  }

  if (state === 'empty') {
    return Promise.resolve(jsonResponse(url.includes('/rpc/summary') ? EMPTY_SUMMARY : [], 200))
  }

  return Promise.resolve(
    jsonResponse(
      {
        code: '57014',
        message: 'canceling statement due to statement timeout',
        details: null,
        hint: null,
      },
      500,
    ),
  )
}

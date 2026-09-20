import { QueryClient } from '@tanstack/react-query'

/**
 * Defaults for every query in the dashboard.
 *
 * This is one of the three layers that replaced Redis (ADR-0002). Most repeat traffic in
 * an analytics dashboard is the same person flipping between two screens over the same
 * date range, and this removes it before it becomes a request at all.
 *
 * staleTime is 30 seconds here, which suits data whose most recent bucket is still open.
 * Screens that ask for a closed historical range raise it to five minutes at the call
 * site, because a range that ended yesterday cannot change.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // Refocusing a tab is not new information about a historical range. Screens that
        // genuinely want live data opt back in.
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Retrying a permission failure just repeats it more expensively.
          const code = (error as { code?: string } | null)?.code
          if (code === '42501' || code === 'PGRST301' || code === '28000') return false
          return failureCount < 2
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
}

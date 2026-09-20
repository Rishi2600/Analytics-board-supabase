import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/auth-provider'
import { createQueryClient } from './query-client'
import { ThemeProvider } from './theme-provider'

/**
 * Provider order matters. The query client has to be outside AuthProvider, because signing
 * out clears the cache and AuthProvider is what notices the sign out.
 */
export function Providers({ children }: { children: ReactNode }) {
  // Created in state rather than at module scope so that a hot reload, or a second render
  // root in a test, does not share one cache between them.
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

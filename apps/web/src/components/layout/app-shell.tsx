import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { RouteErrorBoundary } from '@/components/feedback/route-error-boundary'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { CommandPalette } from './command-palette'
import { TopBar } from './top-bar'

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <SidebarProvider>
      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <TopBar
          onOpenPalette={() => {
            setPaletteOpen(true)
          }}
        />
        <main id="content" tabIndex={-1} className="flex-1 outline-none">
          <RouteErrorBoundary key={pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SidebarProvider>
  )
}

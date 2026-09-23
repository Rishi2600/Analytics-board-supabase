import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { AccountMenu } from './account-menu'
import { ProjectSwitcher } from './project-switcher'
import { ThemeToggle } from './theme-toggle'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 border-b bg-background px-2 sm:px-3">
      <SidebarTrigger aria-label="Show or hide navigation" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
      <ProjectSwitcher />

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          className="hidden w-64 justify-start font-normal text-muted-foreground md:flex"
          onClick={onOpenPalette}
        >
          <Search data-icon="inline-start" />
          Go to a screen or project
          <KbdGroup className="ml-auto">
            <Kbd>{isMac ? 'Cmd' : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Go to a screen or project"
          onClick={onOpenPalette}
        >
          <Search />
        </Button>
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  )
}

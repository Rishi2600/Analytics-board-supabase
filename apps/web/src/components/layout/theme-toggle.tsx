import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/app/use-theme'

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${theme}`}>
          {resolvedTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            setTheme('light')
          }}
        >
          <Sun size={16} /> Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setTheme('dark')
          }}
        >
          <Moon size={16} /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setTheme('system')
          }}
        >
          <Monitor size={16} /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

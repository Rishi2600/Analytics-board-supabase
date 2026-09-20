import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useProjects } from '@/features/projects/api'
import { NAV_ITEMS } from './nav-items'

/**
 * cmd+K. Jumps to any screen, or to another project.
 *
 * Bound on keydown at the window rather than through a library, because the shortcut has
 * to work from inside a chart or a table cell, not only when the body has focus.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const projects = useProjects()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((previous) => !previous)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const go = (path: string) => {
    setOpen(false)
    void navigate(path)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to a screen or project"
    >
      <CommandInput placeholder="Go to a screen or project" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        {projectId ? (
          <CommandGroup heading="Go to">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.to}
                value={`${item.label} ${item.hint}`}
                onSelect={() => {
                  go(`/p/${projectId}/${item.to}`)
                }}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{item.hint}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        <CommandSeparator />

        <CommandGroup heading="Projects">
          {projects.data?.map((project) => (
            <CommandItem
              key={project.id}
              value={`project ${project.name}`}
              onSelect={() => {
                go(`/p/${project.id}/overview`)
              }}
            >
              <span>{project.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

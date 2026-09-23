import { useEffect } from 'react'
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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Ctrl or Cmd + K. Jumps to any screen, or to another project. The shortcut is bound on the
 * window so it works from inside a chart or a table cell, not only when the body has focus.
 */
export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const projects = useProjects()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  const go = (path: string) => {
    onOpenChange(false)
    void navigate(path)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Go to"
      description="Jump to a screen or another project"
    >
      <CommandInput placeholder="Go to a screen or project" />
      <CommandList>
        <CommandEmpty>No screen or project has that name.</CommandEmpty>

        {projectId ? (
          <CommandGroup heading="Screens">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.to}
                value={`${item.label} ${item.hint}`}
                onSelect={() => {
                  go(`/p/${projectId}/${item.to}`)
                }}
              >
                <item.icon />
                <span>{item.label}</span>
                <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
                  {item.hint}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        <CommandSeparator />

        <CommandGroup heading="Projects">
          {projects.data?.map((project) => (
            <CommandItem
              key={project.id}
              value={`project ${project.name} ${project.id}`}
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

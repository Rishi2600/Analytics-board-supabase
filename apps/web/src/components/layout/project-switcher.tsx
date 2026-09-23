import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useOrganizations } from '@/features/orgs/api'
import { useProjects } from '@/features/projects/api'

export function ProjectSwitcher() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const projects = useProjects()
  const orgs = useOrganizations()

  const current = projects.data?.find((p) => p.id === projectId)
  const orgName = orgs.data?.find((o) => o.id === current?.org_id)?.name

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The trigger may shorten a long name on a phone. The menu shows every name in full. */}
        <Button variant="ghost" className="min-w-0 justify-start font-normal">
          {orgName ? (
            <span className="hidden text-muted-foreground sm:inline">{orgName} /</span>
          ) : null}
          <span className="truncate font-medium">{current?.name ?? 'Choose a project'}</span>
          <ChevronsUpDown data-icon="inline-end" className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{orgName ?? 'Projects'}</DropdownMenuLabel>
          {projects.data?.length ? (
            projects.data.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onSelect={() => {
                  void navigate(`/p/${project.id}/overview`)
                }}
              >
                <span className="min-w-0 flex-1 break-words">{project.name}</span>
                {project.id === projectId ? <Check aria-label="Current project" /> : null}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              void navigate('/onboarding')
            }}
          >
            <Plus />
            New project
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

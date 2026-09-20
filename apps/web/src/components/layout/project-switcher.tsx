import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
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
        <Button variant="ghost" size="sm" className="-ml-1 gap-2 font-normal">
          <span className="truncate">
            {orgName ? <span className="text-muted-foreground">{orgName} / </span> : null}
            {current?.name ?? 'Select project'}
          </span>
          <ChevronsUpDown size={16} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {projects.data?.length ? (
          projects.data.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => {
                void navigate(`/p/${project.id}/overview`)
              }}
            >
              <Check size={16} className={project.id === projectId ? 'opacity-100' : 'opacity-0'} />
              <span className="truncate">{project.name}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void navigate('/onboarding')
          }}
        >
          <Plus size={16} /> New project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { useParams, useSearchParams } from 'react-router'
import { ErrorState } from '@/components/feedback/error-state'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuditLogPanel } from '@/features/orgs/audit-log-panel'
import { MembersPanel } from '@/features/orgs/members-panel'
import { KeysTable } from '@/features/keys/keys-table'
import { InstallSnippet } from '@/features/projects/install-snippet'
import { ProjectSettingsForm } from '@/features/projects/project-settings-form'
import { useProject } from '@/features/projects/api'

const TABS = ['install', 'project', 'keys', 'members', 'audit'] as const

export function SettingsRoute() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const project = useProject(projectId)

  const requested = searchParams.get('tab')
  const active = TABS.find((t) => t === requested) ?? 'install'

  if (project.isPending) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className="space-y-3 p-6">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    )
  }

  if (project.isError || !projectId) {
    return (
      <>
        <PageHeader title="Settings" />
        <ErrorState
          title="We could not load this project"
          description="It may have been deleted, or you may no longer have access to it."
          error={project.error}
          onRetry={() => void project.refetch()}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Settings" meta={project.data.name} />

      <Tabs
        value={active}
        onValueChange={(next) => {
          setSearchParams({ tab: next }, { replace: true })
        }}
      >
        <TabsList className="mx-6 mt-4">
          <TabsTrigger value="install">Install</TabsTrigger>
          <TabsTrigger value="project">Project</TabsTrigger>
          <TabsTrigger value="keys">API keys</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <div className="m-6 rounded-md border bg-card">
          <TabsContent value="install">
            <InstallSnippet projectId={projectId} />
          </TabsContent>
          <TabsContent value="project">
            <ProjectSettingsForm project={project.data} />
          </TabsContent>
          <TabsContent value="keys">
            <KeysTable projectId={projectId} />
          </TabsContent>
          <TabsContent value="members">
            <MembersPanel orgId={project.data.org_id} />
          </TabsContent>
          <TabsContent value="audit">
            <AuditLogPanel orgId={project.data.org_id} />
          </TabsContent>
        </div>
      </Tabs>
    </>
  )
}

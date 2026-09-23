import { useParams, useSearchParams } from 'react-router'
import { ErrorState } from '@/components/feedback/error-state'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KeysTable } from '@/features/keys/keys-table'
import { AuditLogPanel } from '@/features/orgs/audit-log-panel'
import { MembersPanel } from '@/features/orgs/members-panel'
import { useProject } from '@/features/projects/api'
import { InstallSnippet } from '@/features/projects/install-snippet'
import { ProjectSettingsForm } from '@/features/projects/project-settings-form'

const TABS = [
  { value: 'install', label: 'Install' },
  { value: 'project', label: 'Project' },
  { value: 'keys', label: 'API keys' },
  { value: 'members', label: 'Members' },
  { value: 'audit', label: 'Audit log' },
] as const

export function SettingsRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const project = useProject(projectId)

  const requested = searchParams.get('tab')
  const active = TABS.find((t) => t.value === requested)?.value ?? 'install'

  if (project.isPending) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className="flex flex-col gap-4 p-4 sm:p-6" aria-busy="true">
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    )
  }

  if (project.isError) {
    return (
      <>
        <PageHeader title="Settings" />
        <ErrorState
          className="p-4 sm:p-6"
          title="This project did not load"
          description="It may have been deleted, or you may no longer have access to it. Try again, or pick another project from the switcher."
          error={project.error}
          onRetry={() => void project.refetch()}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Settings">
        <p className="text-sm wrap-anywhere text-muted-foreground">{project.data.name}</p>
      </PageHeader>

      <Tabs
        value={active}
        onValueChange={(next) => {
          setSearchParams({ tab: next }, { replace: true })
        }}
      >
        {/* Five tabs are wider than a phone. The rail scrolls, and the next tab peeks past the
            edge so it is clear there is more. */}
        <div className="overflow-x-auto border-b px-4 sm:px-6">
          <TabsList variant="line" className="h-10">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="p-4 sm:p-6">
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

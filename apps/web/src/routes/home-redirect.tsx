import { Navigate } from 'react-router'
import { ErrorState } from '@/components/feedback/error-state'
import { useProjects } from '@/features/projects/api'

/**
 * Where "/" goes. Straight to the first project, or to onboarding if there is not one yet.
 */
export function HomeRedirect() {
  const projects = useProjects()

  if (projects.isPending) {
    return <div className="min-h-svh" aria-busy="true" />
  }

  if (projects.isError) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <ErrorState
          title="We could not load your projects"
          description="The database did not answer. This is usually a connection problem rather than anything wrong with your account."
          error={projects.error}
          onRetry={() => void projects.refetch()}
        />
      </main>
    )
  }

  const first = projects.data[0]
  return <Navigate to={first ? `/p/${first.id}/overview` : '/onboarding'} replace />
}

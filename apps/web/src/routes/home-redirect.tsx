import { Navigate } from 'react-router'
import { ErrorState } from '@/components/feedback/error-state'
import { AuthLayout } from '@/components/layout/auth-layout'
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
      <AuthLayout title="Your projects did not load">
        <ErrorState
          className="p-0"
          title="The database did not answer"
          description="This is usually a connection problem rather than anything wrong with your account. Try again."
          error={projects.error}
          onRetry={() => void projects.refetch()}
        />
      </AuthLayout>
    )
  }

  const first = projects.data[0]
  return <Navigate to={first ? `/p/${first.id}/overview` : '/onboarding'} replace />
}

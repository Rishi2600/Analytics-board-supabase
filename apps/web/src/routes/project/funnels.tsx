import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/feedback/empty-state'

export function FunnelsRoute() {
  return (
    <>
      <PageHeader title="Funnels" />
      <EmptyState
        title="No events yet"
        description="Install the snippet on your site to start collecting. This screen fills in as soon as the first event arrives."
      />
    </>
  )
}

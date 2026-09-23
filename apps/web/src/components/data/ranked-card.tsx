import { Inbox, type LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { BarList, type BarListItem } from './bar-list'
import { DataCard } from './data-card'

interface RankedQuery<T> {
  isPending: boolean
  isError: boolean
  error: unknown
  data?: T[]
  refetch: () => unknown
}

interface RankedCardProps<T> {
  title: string
  query: RankedQuery<T>
  toItems: (rows: T[]) => BarListItem[]
  emptyTitle: string
  emptyDescription: string
  icon?: LucideIcon
}

/** A ranked list in a panel, with its loading, empty and error states. */
export function RankedCard<T>({
  title,
  query,
  toItems,
  emptyTitle,
  emptyDescription,
  icon = Inbox,
}: RankedCardProps<T>) {
  return (
    <DataCard title={title}>
      {query.isPending ? (
        <TableSkeleton rows={5} columns={3} />
      ) : query.isError ? (
        <ErrorState
          title={`${title} did not load`}
          description="Only this panel failed; the rest of the page is unaffected. Try again."
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <BarList label={title} items={toItems(query.data)} />
      )}
    </DataCard>
  )
}

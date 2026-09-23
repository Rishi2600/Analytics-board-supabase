import { KeyRound } from 'lucide-react'
import { Link } from 'react-router'
import { DataCard } from '@/components/data/data-card'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/format'
import { useApiKeys } from './api'

/** Which keys are sending, so an integration that went quiet is easy to spot. */
export function KeysSendingCard({ projectId }: { projectId: string }) {
  const keys = useApiKeys(projectId)

  return (
    <DataCard title="Keys sending events">
      {keys.isPending ? (
        <TableSkeleton rows={3} columns={3} />
      ) : keys.isError ? (
        <ErrorState
          title="The key list did not load"
          description="Your keys are unaffected and still work. Try again."
          error={keys.error}
          onRetry={() => void keys.refetch()}
        />
      ) : keys.data.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No keys yet"
          description="Your app needs an API key to send events."
          action={
            <Button asChild>
              <Link to={`/p/${projectId}/settings?tab=keys`}>Create a key</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col">
          {keys.data.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1 text-sm wrap-anywhere">{key.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{key.key_prefix}</span>
              {key.revoked_at ? (
                <StatusBadge tone="neutral">Revoked</StatusBadge>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {key.last_used_at ? `Used ${formatRelative(key.last_used_at)}` : 'Never used'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </DataCard>
  )
}

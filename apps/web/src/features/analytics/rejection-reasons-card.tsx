import { CircleCheck } from 'lucide-react'
import { DataCard } from '@/components/data/data-card'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { formatInteger, formatRelative } from '@/lib/format'
import { REJECTION_LABELS } from '@/lib/labels'
import { useRejectionReasons } from './api'
import type { DateRange } from './date-range'

export function RejectionReasonsCard({
  projectId,
  range,
}: {
  projectId: string
  range: DateRange
}) {
  const reasons = useRejectionReasons(projectId, range)

  return (
    <DataCard title="Why events were refused">
      {reasons.isPending ? (
        <TableSkeleton rows={3} columns={3} />
      ) : reasons.isError ? (
        <ErrorState
          title="Refusal reasons did not load"
          description="This is a read that failed; ingestion itself is unaffected. Try again."
          error={reasons.error}
          onRetry={() => void reasons.refetch()}
        />
      ) : reasons.data.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing was refused"
          description="Every event sent in this range was accepted."
        />
      ) : (
        <ul className="flex flex-col">
          {reasons.data.map((reason) => {
            const label = REJECTION_LABELS[reason.reason]
            return (
              <li
                key={reason.reason}
                className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {label?.title ?? reason.reason}
                  </span>
                  <span className="text-sm">
                    <span className="value">{formatInteger(reason.total)}</span> refused
                  </span>
                  <span className="text-xs text-muted-foreground">
                    last {formatRelative(reason.last_seen)}
                  </span>
                </div>
                {label ? <p className="text-xs text-muted-foreground">{label.fix}</p> : null}
                {reason.sample ? (
                  <details className="text-xs">
                    <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                      Show an example payload
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-sm border bg-muted p-2 font-mono wrap-anywhere whitespace-pre-wrap text-muted-foreground">
                      {JSON.stringify(reason.sample, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </DataCard>
  )
}

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Skeletons shaped like the content they stand in for, so the page does not jump when the
 * data lands. The jump is the part people notice.
 */

export function MetricStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Card className="gap-0 py-0" aria-busy="true" aria-label="Loading headline numbers">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={cn(
              'flex flex-col gap-2.5 p-4',
              i % 2 === 1 && 'border-l',
              i >= 2 && 'border-t lg:border-t-0',
              i === 2 && 'lg:border-l',
            )}
          >
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </Card>
  )
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex h-72 flex-col justify-end gap-2 p-4', className)}
      aria-busy="true"
      aria-label="Loading chart"
    >
      <div className="flex flex-1 items-end gap-1.5">
        {Array.from({ length: 24 }, (_, i) => (
          <Skeleton
            key={i}
            className="flex-1"
            // A varied but fixed profile. Random heights would reshuffle on every render and
            // read as flicker rather than loading.
            style={{ height: `${String(30 + ((i * 37) % 60))}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between pt-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-3 w-10" />
        ))}
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 6, columns = 3 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading rows">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'flex-1' : 'w-16 sm:w-20')} />
          ))}
        </div>
      ))}
    </div>
  )
}

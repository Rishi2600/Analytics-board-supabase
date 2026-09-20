import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Skeletons shaped like the content they stand in for.
 *
 * A centred spinner tells the user that something is happening. A skeleton tells them what
 * is about to arrive and reserves the space for it, so the page does not jump when the
 * data lands. The jump is the part people actually notice.
 */

export function KpiCardSkeleton() {
  return (
    <div className="rounded-md border bg-card p-4">
      <Skeleton className="h-8 w-28" />
      <Skeleton className="mt-3 h-3 w-20" />
      <Skeleton className="mt-3 h-5 w-16" />
    </div>
  )
}

export function KpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="flex flex-col justify-end gap-2 p-4" style={{ height }}>
      <div className="flex flex-1 items-end gap-1.5">
        {Array.from({ length: 24 }, (_, i) => (
          <Skeleton
            key={i}
            className="flex-1"
            // A varied but deterministic profile. Random heights would re-shuffle on every
            // render and read as flicker rather than as loading.
            style={{ height: `${30 + ((i * 37) % 60)}%` }}
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
    <div className="divide-y divide-border">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-2.5">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'flex-1' : 'w-20')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SparklineSkeleton() {
  return <Skeleton className="h-8 w-full" />
}

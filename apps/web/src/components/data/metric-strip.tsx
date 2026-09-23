import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface Metric {
  label: string
  /** Already formatted, through lib/format. */
  value: string
  /** Shown under the value: a delta badge, or a sentence about the state. */
  detail?: ReactNode
}

/**
 * The headline numbers as one instrument: a single card divided into readouts by hairlines,
 * four across on wide screens and two by two on narrow ones.
 */
export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <Card className="gap-0 py-0">
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={cn('flex min-w-0 flex-col gap-1.5 p-4', cellBorders(index))}
          >
            <dt className="text-xs text-muted-foreground">{metric.label}</dt>
            <dd className="value order-first text-kpi font-medium break-words">{metric.value}</dd>
            {metric.detail ? (
              <dd className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {metric.detail}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </Card>
  )
}

/** Hairlines between readouts, for a two column grid that becomes four columns at lg. */
function cellBorders(index: number): string {
  return cn(
    index % 2 === 1 && 'border-l',
    index >= 2 && 'border-t lg:border-t-0',
    index === 2 && 'lg:border-l',
  )
}

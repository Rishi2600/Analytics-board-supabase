import { Sparkline } from '@/components/charts/sparkline'
import { cn } from '@/lib/utils'
import { computeDelta } from '@/lib/format'

interface MetricCardProps {
  label: string
  /** Already formatted. Formatting lives in lib/format, not here. */
  value: string
  current: number
  previous: number
  trend?: number[]
  colorIndex?: number
}

/**
 * A KPI card.
 *
 * Value in mono at large size, label beneath in small sans, delta as a small bordered
 * pill. No icon: an icon on a KPI card is decoration competing with the number, which is
 * the one thing the card exists to show.
 */
export function MetricCard({
  label,
  value,
  current,
  previous,
  trend,
  colorIndex = 0,
}: MetricCardProps) {
  const delta = computeDelta(current, previous)

  return (
    <div className="rounded-md border bg-card p-4">
      <p className="value text-3xl leading-none font-medium">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>

      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            'value rounded-sm border px-1.5 py-0.5 text-xs',
            delta.direction === 'up' && 'border-ok/30 text-ok',
            delta.direction === 'down' && 'border-destructive/30 text-destructive',
            (delta.direction === 'flat' || delta.direction === 'unknown') &&
              'text-muted-foreground',
          )}
          // Colour is not the only carrier of meaning: the sign is in the label itself.
          title={`Compared with the previous equivalent period`}
        >
          {delta.label}
        </span>
        <span className="text-xs text-muted-foreground">vs previous period</span>
      </div>

      {trend && trend.length > 1 ? (
        <div className="mt-3">
          <Sparkline data={trend} colorIndex={colorIndex} />
        </div>
      ) : null}
    </div>
  )
}

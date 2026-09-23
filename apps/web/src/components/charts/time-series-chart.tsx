import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatCompact } from '@/lib/format'
import { formatInProjectZone } from '@/lib/tz'
import { cn } from '@/lib/utils'
import { MAX_SERIES, seriesColor } from './series-styles'

export interface SeriesPoint {
  bucket: string
  [series: string]: string | number
}

interface Props {
  data: SeriesPoint[]
  series: string[]
  timeZone: string
  resolution: string
  /** Read out by screen readers in place of the drawing. */
  label: string
  className?: string
}

const TICK_PATTERNS: Record<string, string> = { hour: 'HH:mm', day: 'd MMM', week: 'd MMM' }

/**
 * The main time series. Horizontal gridlines only, ticks cut in the project's timezone,
 * and a legend whenever there is more than one line. Animation is off: a line that draws
 * itself cannot be read while it is drawing.
 */
export function TimeSeriesChart({ data, series, timeZone, resolution, label, className }: Props) {
  // Series names are event names or property values such as "/pricing", which cannot be CSS
  // custom property names. Each gets a safe key, and its real name as the label.
  const { visible, config, rows } = useMemo(() => {
    const visible = series.slice(0, MAX_SERIES)
    const config: ChartConfig = {}
    visible.forEach((name, index) => {
      config[`s${String(index)}`] = { label: name, color: seriesColor(index) }
    })
    const rows = data.map((point) => {
      const row: Record<string, string | number> = { bucket: point.bucket }
      visible.forEach((name, index) => {
        row[`s${String(index)}`] = point[name] ?? 0
      })
      return row
    })
    return { visible, config, rows }
  }, [data, series])

  // Hourly ticks across several days need the date, or "01:30" could be any of them.
  const first = data[0]?.bucket
  const last = data[data.length - 1]?.bucket
  const spansDays =
    first !== undefined &&
    last !== undefined &&
    Date.parse(last) - Date.parse(first) > 36 * 3_600_000
  const tickPattern =
    resolution === 'hour' && spansDays ? 'd MMM HH:mm' : (TICK_PATTERNS[resolution] ?? 'd MMM')
  const tooltipPattern = resolution === 'hour' ? 'd MMM, HH:mm' : 'EEE d MMM yyyy'

  return (
    <ChartContainer
      config={config}
      role="figure"
      aria-label={label}
      className={cn('aspect-auto h-72 w-full', className)}
    >
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(value: string) =>
            formatInProjectZone(new Date(value), timeZone, tickPattern)
          }
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(value: number) => formatCompact(value)}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const bucket = payload[0]?.payload as { bucket?: string } | undefined
                return bucket?.bucket
                  ? formatInProjectZone(new Date(bucket.bucket), timeZone, tooltipPattern)
                  : ''
              }}
            />
          }
        />
        {visible.length > 1 ? (
          <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        ) : null}
        {visible.map((_, index) => (
          <Line
            key={index}
            dataKey={`s${String(index)}`}
            type="monotone"
            stroke={`var(--color-s${String(index)})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}

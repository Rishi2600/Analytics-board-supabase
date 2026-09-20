import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCompact } from '@/lib/format'
import { formatInProjectZone } from '@/lib/tz'
import { ChartTooltip } from './chart-tooltip'
import { MAX_SERIES, strokeClass } from './series-styles'

export interface SeriesPoint {
  bucket: string
  [series: string]: string | number
}

interface Props {
  data: SeriesPoint[]
  series: string[]
  timeZone: string
  resolution: string
  height?: number
}

const LABEL_PATTERNS: Record<string, string> = {
  hour: 'HH:mm',
  day: 'd MMM',
  week: 'd MMM',
}

/**
 * The main time series.
 *
 * Horizontal gridlines only and subtle, short axis labels, a fixed height container so
 * nothing shifts when the data lands, and axis ticks cut in the project's timezone rather
 * than the browser's. Animation is off: a line that draws itself cannot be read while it
 * is drawing.
 */
export function TimeSeriesChart({ data, series, timeZone, resolution, height = 280 }: Props) {
  const pattern = LABEL_PATTERNS[resolution] ?? 'd MMM'
  const visible = series.slice(0, MAX_SERIES)

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} className="stroke-border" strokeOpacity={0.6} />
          <XAxis
            dataKey="bucket"
            tickFormatter={(value: string) =>
              formatInProjectZone(new Date(value), timeZone, pattern)
            }
            className="text-muted-foreground"
            stroke="currentColor"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompact(value)}
            className="text-muted-foreground"
            stroke="currentColor"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            content={
              <ChartTooltip
                timeZone={timeZone}
                series={visible}
                labelPattern={resolution === 'hour' ? 'd MMM, HH:mm' : 'd MMM yyyy'}
              />
            }
            cursor={{ className: 'stroke-border' }}
          />
          {visible.map((name, index) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              name={name}
              className={strokeClass(index)}
              stroke="currentColor"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

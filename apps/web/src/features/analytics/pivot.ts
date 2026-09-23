import type { SeriesPoint } from '@/components/charts/time-series-chart'
import type { TimeseriesPoint } from './api'

/**
 * Recharts wants one object per x value with a key per series. The API returns one row per
 * (bucket, event), which is the right shape for SQL and the wrong shape for a chart.
 */
export function pivotSeries(rows: TimeseriesPoint[]): {
  data: SeriesPoint[]
  series: string[]
  resolution: string
} {
  const byBucket = new Map<string, SeriesPoint>()
  const totals = new Map<string, number>()

  for (const row of rows) {
    totals.set(row.event_name, (totals.get(row.event_name) ?? 0) + row.event_count)
    const existing = byBucket.get(row.bucket) ?? { bucket: row.bucket }
    existing[row.event_name] = row.event_count
    byBucket.set(row.bucket, existing)
  }

  // Largest first: the chart shows at most six series, and the first colours are the most
  // distinct, so they go to the series people look at most.
  const seriesNames = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  const data = [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket))

  // A gap in a line chart is ambiguous: it reads as missing data rather than as zero. The
  // rollup only writes rows for buckets that had events, so the zeros are filled in here.
  for (const point of data) {
    for (const name of seriesNames) {
      if (point[name] === undefined) point[name] = 0
    }
  }

  return { data, series: seriesNames, resolution: rows[0]?.resolution ?? 'day' }
}

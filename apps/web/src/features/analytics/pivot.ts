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
  const series = new Set<string>()

  for (const row of rows) {
    series.add(row.event_name)
    const existing = byBucket.get(row.bucket) ?? { bucket: row.bucket }
    existing[row.event_name] = row.event_count
    byBucket.set(row.bucket, existing)
  }

  const seriesNames = [...series]
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

/** Collapses a multi-series result into one total per bucket, for the sparkline. */
export function totalsByBucket(rows: TimeseriesPoint[]): number[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.bucket, (totals.get(row.bucket) ?? 0) + row.event_count)
  }
  return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)
}

import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Link } from 'react-router'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { ChartSkeleton, KpiRowSkeleton, TableSkeleton } from '@/components/feedback/skeletons'
import { TimeSeriesChart } from '@/components/charts/time-series-chart'
import { BarList } from '@/components/data/bar-list'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { MetricCard } from '@/components/data/metric-card'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { useBreakdown, useSummary, useTimeseries, useTopEvents } from '@/features/analytics/api'
import { DEFAULT_PRESET, presetById } from '@/features/analytics/date-range'
import { pivotSeries, totalsByBucket } from '@/features/analytics/pivot'
import { useProject } from '@/features/projects/api'
import { formatDecimal, formatInteger } from '@/lib/format'
import { timeZoneLabel } from '@/lib/tz'

export function OverviewRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const range = useMemo(() => presetById(preset).build(), [preset])

  const project = useProject(projectId)
  const summary = useSummary(projectId, range)
  const timeseries = useTimeseries(projectId, range)
  const topEvents = useTopEvents(projectId, range, 8)
  const pages = useBreakdown(projectId, range, 'page_view', 'path', 8)
  const countries = useBreakdown(projectId, range, null, 'country', 8)

  const timeZone = project.data?.timezone ?? summary.data?.timezone ?? 'Etc/UTC'
  const chart = useMemo(() => pivotSeries(timeseries.data ?? []), [timeseries.data])
  const trend = useMemo(() => totalsByBucket(timeseries.data ?? []), [timeseries.data])

  const hasNoData = summary.isSuccess && summary.data.total_events === 0

  return (
    <>
      <PageHeader
        title="Overview"
        meta={timeZoneLabel(timeZone)}
        actions={<DateRangePicker value={preset} onChange={setPreset} />}
      />

      <div className="space-y-6 p-6">
        {summary.isPending ? (
          <KpiRowSkeleton />
        ) : summary.isError ? (
          <ErrorState
            title="The headline numbers did not load"
            description="The aggregate query failed. Your events are unaffected; this is a read that can be retried."
            error={summary.error}
            onRetry={() => void summary.refetch()}
          />
        ) : hasNoData ? (
          <EmptyState
            title="No events yet"
            description="Install the snippet on your site to start collecting. This screen fills in within about five minutes of the first event."
            action={
              <Button asChild size="sm">
                <Link to={`/p/${projectId}/settings?tab=install`}>Get the snippet</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total events"
              value={formatInteger(summary.data.total_events)}
              current={summary.data.total_events}
              previous={summary.data.prev_total_events}
              trend={trend}
              colorIndex={0}
            />
            <MetricCard
              label="Unique users"
              value={formatInteger(summary.data.unique_users)}
              current={summary.data.unique_users}
              previous={summary.data.prev_unique_users}
              colorIndex={1}
            />
            <MetricCard
              label="Sessions"
              value={formatInteger(summary.data.sessions)}
              current={summary.data.sessions}
              previous={summary.data.prev_sessions}
              colorIndex={2}
            />
            <MetricCard
              label="Events per user"
              value={formatDecimal(summary.data.events_per_user)}
              current={summary.data.events_per_user}
              previous={summary.data.prev_events_per_user}
              colorIndex={3}
            />
          </div>
        )}

        <section className="rounded-md border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Events over time</h2>
            <span className="text-xs text-muted-foreground">
              {chart.resolution === 'hour'
                ? 'Hourly'
                : chart.resolution === 'week'
                  ? 'Weekly'
                  : 'Daily'}
            </span>
          </div>

          {timeseries.isPending ? (
            <ChartSkeleton />
          ) : timeseries.isError ? (
            <ErrorState
              title="The chart did not load"
              description="The time series query failed. Narrowing the date range sometimes helps if this repeats."
              error={timeseries.error}
              onRetry={() => void timeseries.refetch()}
            />
          ) : chart.data.length === 0 ? (
            <EmptyState
              title="Nothing in this range"
              description="No events were recorded between these dates. Try a wider range."
            />
          ) : (
            <div className="p-2">
              <TimeSeriesChart
                data={chart.data}
                series={chart.series.slice(0, 6)}
                timeZone={timeZone}
                resolution={chart.resolution}
              />
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="Top events"
            query={topEvents}
            emptyTitle="No events in this range"
            emptyDescription="Once events arrive they are ranked here by volume."
            render={(rows) => (
              <BarList
                items={rows.map((r) => ({
                  label: r.event_name,
                  value: r.event_count,
                  share: r.share,
                }))}
              />
            )}
          />

          <Panel
            title="Top pages"
            query={pages}
            emptyTitle="No page views yet"
            emptyDescription="Call page() from the SDK to record which pages people visit."
            render={(rows) => (
              <BarList
                items={rows.map((r) => ({
                  label: r.prop_value,
                  value: r.event_count,
                  share: r.share,
                }))}
              />
            )}
          />
        </div>

        <Panel
          title="Top countries"
          query={countries}
          emptyTitle="No country data yet"
          emptyDescription="Country is derived at the edge from the request, and appears once events arrive."
          render={(rows) => (
            <BarList
              items={rows.map((r) => ({
                label: r.prop_value,
                value: r.event_count,
                share: r.share,
              }))}
            />
          )}
        />
      </div>
    </>
  )
}

interface PanelQuery<T> {
  isPending: boolean
  isError: boolean
  error: unknown
  data?: T[]
  refetch: () => unknown
}

/** Every panel ships the same three states, so they are written once here. */
function Panel<T>({
  title,
  query,
  emptyTitle,
  emptyDescription,
  render,
}: {
  title: string
  query: PanelQuery<T>
  emptyTitle: string
  emptyDescription: string
  render: (rows: T[]) => React.ReactNode
}) {
  return (
    <section className="rounded-md border bg-card">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      {query.isPending ? (
        <TableSkeleton rows={5} columns={2} />
      ) : query.isError ? (
        <ErrorState
          title={`${title} did not load`}
          description="This panel failed on its own; the rest of the page is unaffected."
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        render(query.data)
      )}
    </section>
  )
}
